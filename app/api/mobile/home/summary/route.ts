import { NextRequest, NextResponse } from "next/server";
import { INDIA_TIME_ZONE, isoDateInIndia, normalizeTimeZoneToIndia } from "@/lib/dateTime";
import { getMobileSessionContext } from "@/lib/mobileSession";
import {
  resolveAttendancePolicyRuntime,
  resolveCorrectionPolicyRuntime,
  resolveHolidayPolicyRuntime,
  resolveShiftPolicyRuntime,
} from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import {
  applyNonWorkingDayTreatment,
  buildAttendanceMetrics,
  buildDailyAttendanceDecision,
  resolveWorkedMinutesForAttendance,
  type NonWorkingDayTreatment,
} from "@/lib/attendancePolicy";
import { isWeeklyOffDate } from "@/lib/weeklyOff";
import {
  applyExtraHoursPolicy,
  normalizeExtraHoursPolicy,
  normalizeHalfDayMinWorkMins,
  normalizePunchAccessRule,
  shiftDurationMinutes,
  timeToMinutes,
} from "@/lib/shiftWorkPolicy";

function normalizeTimeZone(value: unknown) {
  return normalizeTimeZoneToIndia(value);
}

function currentDateInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${lookup("year")}-${lookup("month")}-${lookup("day")}`;
}

function buildMonthWindow(date: string) {
  const [yearText, monthText] = date.split("-");
  const start = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 2);
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
  };
}

function punchEventAt(row: {
  effective_punch_at?: string | null;
  estimated_time_at?: string | null;
  device_time_at?: string | null;
  server_received_at?: string | null;
}) {
  return row.effective_punch_at || row.estimated_time_at || row.device_time_at || row.server_received_at || null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionToken?: string;
    timeZone?: string;
  };

  const session = await getMobileSessionContext({
    sessionToken: body.sessionToken,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const timeZone = normalizeTimeZone(body.timeZone || INDIA_TIME_ZONE);
  const today = currentDateInTimeZone(timeZone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const { fromIso, toIso } = buildMonthWindow(today);
  const policyContext = await resolvePoliciesForEmployee(
    session.admin,
    session.employee.company_id,
    session.employee.id,
    today,
    ["shift", "attendance", "holiday_weekoff", "correction"],
  );

  const [employeeResult, companyResult, eventsResult, holidayResult] = await Promise.all([
    session.admin
      .from("employees")
      .select("full_name,employee_code,designation,shift_name")
      .eq("id", session.employee.id)
      .eq("company_id", session.employee.company_id)
      .maybeSingle(),
    session.admin
      .from("companies")
      .select("name,company_tagline")
      .eq("id", session.employee.company_id)
      .maybeSingle(),
    session.admin
      .from("attendance_punch_events")
      .select("punch_type,effective_punch_at,estimated_time_at,device_time_at,server_received_at,approval_status,approval_reason_codes")
      .eq("company_id", session.employee.company_id)
      .eq("employee_id", session.employee.id)
      .neq("approval_status", "rejected")
      .gte("server_received_at", fromIso)
      .lt("server_received_at", toIso)
      .order("server_received_at", { ascending: false }),
    session.admin
      .from("company_holidays")
      .select("holiday_date")
      .eq("company_id", session.employee.company_id)
      .gte("holiday_date", monthStart)
      .lte("holiday_date", today),
  ]);

  if (employeeResult.error) {
    return NextResponse.json({ error: employeeResult.error.message || "Unable to load employee profile." }, { status: 400 });
  }
  if (companyResult.error) {
    return NextResponse.json({ error: companyResult.error.message || "Unable to load company profile." }, { status: 400 });
  }
  if (eventsResult.error) {
    return NextResponse.json({ error: eventsResult.error.message || "Unable to load today attendance." }, { status: 400 });
  }
  if (holidayResult.error) {
    return NextResponse.json({ error: holidayResult.error.message || "Unable to load holiday marker." }, { status: 400 });
  }

  const recentEvents = (eventsResult.data || []) as Array<{
    punch_type: "in" | "out";
    effective_punch_at: string | null;
    estimated_time_at: string | null;
    device_time_at: string | null;
    server_received_at: string;
    approval_status: "auto_approved" | "pending_approval" | "approved" | "rejected";
    approval_reason_codes?: string[] | null;
  }>;
  const holidayDates = new Set(((holidayResult.data || []) as Array<{ holiday_date: string }>).map((row) => row.holiday_date));

  const events = [...recentEvents].reverse().filter((row) => {
    const punchAt = punchEventAt(row);
    return punchAt ? isoDateInIndia(punchAt) === today : false;
  });

  const firstIn = events.find((row) => row.punch_type === "in") || null;
  const lastOut = [...events].reverse().find((row) => row.punch_type === "out") || null;
  const checkInAt = firstIn ? punchEventAt(firstIn) : null;
  const checkOutAt = lastOut ? punchEventAt(lastOut) : null;
  const pendingApprovalEvent = [...events].reverse().find((row) => row.approval_status === "pending_approval") || null;
  const currentStatus = checkInAt ? (checkOutAt ? "COMPLETED" : "PUNCHED_IN") : "NOT_PUNCHED_IN";
  const employeeShiftName = employeeResult.data?.shift_name || "General";
  const resolvedShift = resolveShiftPolicyRuntime(policyContext.resolved.shift, {
    shiftName: employeeShiftName,
    shiftType: employeeShiftName,
  });
  const matchedShift = {
    name: resolvedShift.shiftName,
    type: resolvedShift.shiftType,
    startTime: resolvedShift.shiftStartTime,
    endTime: resolvedShift.shiftEndTime,
    graceMins: resolvedShift.gracePeriod,
    earlyWindowMins: resolvedShift.earlyPunchAllowed,
    minWorkBeforeOutMins: resolvedShift.minimumWorkBeforePunchOut,
  };
  const shiftStartMin = matchedShift ? timeToMinutes(matchedShift.startTime) || 600 : 600;
  const shiftEndMin = matchedShift ? timeToMinutes(matchedShift.endTime) || 1080 : 1080;
  const effectiveScheduledWorkMin = matchedShift ? shiftDurationMinutes(matchedShift.startTime, matchedShift.endTime) : null;
  const resolvedAttendance = resolveAttendancePolicyRuntime(policyContext.resolved.attendance);
  const resolvedCorrection = resolveCorrectionPolicyRuntime(policyContext.resolved.correction);
  const resolvedHoliday = resolveHolidayPolicyRuntime(policyContext.resolved.holiday_weekoff);
  const extraHoursPolicy = normalizeExtraHoursPolicy(resolvedAttendance.extraHoursPolicy);
  const punchAccessRule = normalizePunchAccessRule(resolvedShift.punchAccessRule);
  const actualWorkedMinutes = resolveWorkedMinutesForAttendance({
    checkInIso: checkInAt,
    checkOutIso: checkOutAt,
    scheduledMinutes: effectiveScheduledWorkMin,
    policy: resolvedAttendance,
  });
  const workingMinutes = applyExtraHoursPolicy(actualWorkedMinutes, effectiveScheduledWorkMin, extraHoursPolicy);
  const todayMetrics = buildAttendanceMetrics({
    checkInIso: checkInAt,
    checkOutIso: checkOutAt,
    timeZone,
    shiftStart: matchedShift?.startTime || null,
    shiftEnd: matchedShift?.endTime || null,
    scheduledMinutes: effectiveScheduledWorkMin,
    graceMins: matchedShift?.graceMins || resolvedShift.gracePeriod || 10,
    halfDayMinWorkMins: normalizeHalfDayMinWorkMins(resolvedShift.halfDayMinWorkMins),
  });
  let lateCycleCount = 0;
  let earlyCycleCount = 0;
  const groupedByDate = new Map<string, typeof events>();
  for (const event of [...recentEvents].reverse()) {
    const punchAt = punchEventAt(event);
    if (!punchAt) continue;
    const localDate = isoDateInIndia(punchAt);
    const bucket = groupedByDate.get(localDate) || [];
    bucket.push(event);
    groupedByDate.set(localDate, bucket);
  }
  const orderedDates = Array.from(groupedByDate.keys()).sort();
  for (const localDate of orderedDates) {
    if (localDate >= today) continue;
    const bucket = groupedByDate.get(localDate) || [];
    const firstInForDay = bucket.find((row) => row.punch_type === "in") || null;
    const lastOutForDay = [...bucket].reverse().find((row) => row.punch_type === "out") || null;
    const dayType =
      holidayDates.has(localDate)
        ? "holiday"
        : isWeeklyOffDate(localDate, resolvedHoliday.weeklyOffPolicy)
          ? "weekly_off"
          : null;
    const metrics = buildAttendanceMetrics({
      checkInIso: firstInForDay ? punchEventAt(firstInForDay) : null,
      checkOutIso: lastOutForDay ? punchEventAt(lastOutForDay) : null,
      timeZone,
      shiftStart: matchedShift?.startTime || null,
      shiftEnd: matchedShift?.endTime || null,
      scheduledMinutes: effectiveScheduledWorkMin,
      graceMins: matchedShift?.graceMins || resolvedShift.gracePeriod || 10,
      halfDayMinWorkMins: normalizeHalfDayMinWorkMins(resolvedShift.halfDayMinWorkMins),
    });
    const countsTowardLateCycle =
      dayType === null &&
      metrics.lateMinutes > 0 && metrics.lateMinutes <= resolvedAttendance.latePunchUpToMinutes;
    const countsTowardEarlyCycle =
      dayType === null &&
      metrics.earlyGoMinutes > 0 && metrics.earlyGoMinutes <= resolvedAttendance.earlyGoUpToMinutes;
    if (countsTowardLateCycle) lateCycleCount += 1;
    if (countsTowardEarlyCycle) earlyCycleCount += 1;
    const decision = buildDailyAttendanceDecision({
      checkInIso: firstInForDay ? punchEventAt(firstInForDay) : null,
      checkOutIso: lastOutForDay ? punchEventAt(lastOutForDay) : null,
      timeZone,
      shiftStart: matchedShift?.startTime || null,
      shiftEnd: matchedShift?.endTime || null,
      scheduledMinutes: effectiveScheduledWorkMin,
      graceMins: matchedShift?.graceMins || resolvedShift.gracePeriod || 10,
      halfDayMinWorkMins: normalizeHalfDayMinWorkMins(resolvedShift.halfDayMinWorkMins),
      policy: resolvedAttendance,
      lateCycleOccurrenceCount: countsTowardLateCycle ? lateCycleCount : 0,
      earlyGoCycleOccurrenceCount: countsTowardEarlyCycle ? earlyCycleCount : 0,
    });
    if (decision.resetLateCycle) lateCycleCount = 0;
    if (decision.resetEarlyGoCycle) earlyCycleCount = 0;
  }
  const todayDayType =
    holidayDates.has(today)
      ? "holiday"
      : isWeeklyOffDate(today, resolvedHoliday.weeklyOffPolicy)
        ? "weekly_off"
        : null;
  const countsTowardLateCycle =
    todayDayType === null &&
    todayMetrics.lateMinutes > 0 && todayMetrics.lateMinutes <= resolvedAttendance.latePunchUpToMinutes;
  const countsTowardEarlyCycle =
    todayDayType === null &&
    todayMetrics.earlyGoMinutes > 0 && todayMetrics.earlyGoMinutes <= resolvedAttendance.earlyGoUpToMinutes;
  const { decision: attendanceDecision, treatmentLabel } = applyNonWorkingDayTreatment({
    decision: buildDailyAttendanceDecision({
      checkInIso: checkInAt,
      checkOutIso: checkOutAt,
      timeZone,
      shiftStart: matchedShift?.startTime || null,
      shiftEnd: matchedShift?.endTime || null,
      scheduledMinutes: effectiveScheduledWorkMin,
      graceMins: matchedShift?.graceMins || resolvedShift.gracePeriod || 10,
      halfDayMinWorkMins: normalizeHalfDayMinWorkMins(resolvedShift.halfDayMinWorkMins),
      policy: resolvedAttendance,
      lateCycleOccurrenceCount: countsTowardLateCycle ? lateCycleCount + 1 : 0,
      earlyGoCycleOccurrenceCount: countsTowardEarlyCycle ? earlyCycleCount + 1 : 0,
    }),
    dayType: (checkInAt || checkOutAt) ? todayDayType : null,
    treatment:
      todayDayType === "holiday"
        ? (resolvedHoliday.holidayWorkedStatus as NonWorkingDayTreatment)
        : todayDayType === "weekly_off"
          ? (resolvedHoliday.weeklyOffWorkedStatus as NonWorkingDayTreatment)
          : null,
  });
  const pendingApprovalReasonCodes = Array.isArray(pendingApprovalEvent?.approval_reason_codes)
    ? pendingApprovalEvent.approval_reason_codes.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const todayRequiresPunchApproval = Boolean(pendingApprovalEvent);
  const todayNextStep = todayRequiresPunchApproval
    ? pendingApprovalReasonCodes.includes("PUNCH_ON_APPROVED_LEAVE")
      ? "punch_on_approved_leave"
      : "offline_punch_review"
    : attendanceDecision.status === "manual_review"
      ? todayDayType === "holiday"
        ? "holiday_worked_review"
        : todayDayType === "weekly_off"
          ? "weekly_off_worked_review"
          : "manual_review"
      : null;

  return NextResponse.json({
    employee: {
      id: session.employee.id,
      employeeCode: employeeResult.data?.employee_code || session.employee.employee_code,
      fullName: employeeResult.data?.full_name || session.employee.full_name,
      designation: employeeResult.data?.designation || "",
      shiftName: matchedShift?.name || resolvedShift.shiftName || employeeShiftName,
      companyName: companyResult.data?.name || "",
      companyTagline: companyResult.data?.company_tagline || "",
      company_tagline: companyResult.data?.company_tagline || "",
    },
    today: {
      date: today,
      status: currentStatus,
      attendanceStatus: attendanceDecision.status,
      requiresManualReview: todayRequiresPunchApproval || attendanceDecision.status === "manual_review",
      nextStep: todayNextStep,
      dayType: todayDayType,
      punchInAt: checkInAt,
      punchOutAt: checkOutAt,
      workingMinutes,
      nonWorkingDayTreatment: treatmentLabel,
    },
    config: {
      shiftName: matchedShift?.name || resolvedShift.shiftName || employeeShiftName,
      shiftStartMin,
      shiftEndMin,
      graceMins: matchedShift?.graceMins || resolvedShift.gracePeriod || 10,
      earlyWindowMin: matchedShift?.earlyWindowMins || resolvedShift.earlyPunchAllowed || 15,
      minWorkBeforeOutMin: matchedShift?.minWorkBeforeOutMins || resolvedShift.minimumWorkBeforePunchOut || 60,
      scheduledWorkMin: effectiveScheduledWorkMin || 0,
      extraHoursPolicy,
      halfDayMinWorkMins: normalizeHalfDayMinWorkMins(resolvedShift.halfDayMinWorkMins),
      punchAccessRule,
      weeklyOffPolicy: resolvedHoliday.weeklyOffPolicy,
      allowPunchOnHoliday: resolvedHoliday.allowPunchOnHoliday,
      allowPunchOnWeeklyOff: resolvedHoliday.allowPunchOnWeeklyOff,
      correctionPolicy: resolvedCorrection,
    },
  });
}
