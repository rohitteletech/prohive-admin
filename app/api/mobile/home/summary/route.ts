import { NextRequest, NextResponse } from "next/server";
import { INDIA_TIME_ZONE, isoDateInIndia, normalizeTimeZoneToIndia } from "@/lib/dateTime";
import { getMobileSessionContext } from "@/lib/mobileSession";
import { resolveAttendancePolicyRuntime, resolveHolidayPolicyRuntime, resolveShiftPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShiftDefaults";
import {
  applyNonWorkingDayTreatment,
  buildAttendanceMetrics,
  buildDailyAttendanceDecision,
  rawWorkedMinutes,
  type NonWorkingDayTreatment,
} from "@/lib/attendancePolicy";
import { isWeeklyOffDate } from "@/lib/weeklyOff";
import {
  applyExtraHoursPolicy,
  findMatchingShiftRule,
  normalizeExtraHoursPolicy,
  normalizeHalfDayMinWorkMins,
  normalizeLoginAccessRule,
  shiftDurationMinutes,
  timeToMinutes,
} from "@/lib/shiftWorkPolicy";

function normalizeTimeZone(value: unknown) {
  return normalizeTimeZoneToIndia(value);
}

function currentDateInTimeZone(timeZone: string) {
  return isoDateInIndia(new Date().toISOString());
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

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    companyId?: string;
    deviceId?: string;
    timeZone?: string;
  };

  const session = await getMobileSessionContext({
    employeeId: body.employeeId,
    companyId: body.companyId,
    deviceId: body.deviceId,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const timeZone = normalizeTimeZone(body.timeZone || INDIA_TIME_ZONE);
  const today = currentDateInTimeZone(timeZone);
  const { fromIso, toIso } = buildMonthWindow(today);
  const policyContext = await resolvePoliciesForEmployee(
    session.admin,
    session.employee.company_id,
    session.employee.id,
    today,
    ["shift", "attendance", "holiday_weekoff"],
  );

  const [employeeResult, companyResult, shiftResult, eventsResult, holidayResult] = await Promise.all([
    session.admin
      .from("employees")
      .select("full_name,employee_code,designation,shift_name")
      .eq("id", session.employee.id)
      .eq("company_id", session.employee.company_id)
      .maybeSingle(),
    session.admin
      .from("companies")
      .select("name,company_tagline,weekly_off_policy,allow_punch_on_holiday,allow_punch_on_weekly_off,extra_hours_policy,login_access_rule,half_day_min_work_mins")
      .eq("id", session.employee.company_id)
      .maybeSingle(),
    session.admin
      .from("company_shift_definitions")
      .select("id,name,type,start_time,end_time,grace_mins,early_window_mins,min_work_before_out_mins,active")
      .eq("company_id", session.employee.company_id)
      .order("created_at", { ascending: true }),
    session.admin
      .from("attendance_punch_events")
      .select("punch_type,effective_punch_at,server_received_at,approval_status")
      .eq("company_id", session.employee.company_id)
      .eq("employee_id", session.employee.id)
      .neq("approval_status", "rejected")
      .gte("effective_punch_at", fromIso)
      .lt("effective_punch_at", toIso)
      .order("server_received_at", { ascending: false }),
    session.admin
      .from("company_holidays")
      .select("id")
      .eq("company_id", session.employee.company_id)
      .eq("holiday_date", today)
      .limit(1)
      .maybeSingle(),
  ]);

  if (employeeResult.error) {
    return NextResponse.json({ error: employeeResult.error.message || "Unable to load employee profile." }, { status: 400 });
  }
  if (companyResult.error) {
    return NextResponse.json({ error: companyResult.error.message || "Unable to load company profile." }, { status: 400 });
  }
  if (shiftResult.error) {
    return NextResponse.json({ error: shiftResult.error.message || "Unable to load shift configuration." }, { status: 400 });
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
    server_received_at: string;
    approval_status: "auto_approved" | "pending_approval" | "approved" | "rejected";
  }>;

  const events = [...recentEvents].reverse().filter((row) => {
    const punchAt = row.effective_punch_at || row.server_received_at;
    return punchAt ? isoDateInIndia(punchAt) === today : false;
  });

  const firstIn = events.find((row) => row.punch_type === "in") || null;
  const lastOut = [...events].reverse().find((row) => row.punch_type === "out") || null;
  const checkInAt = firstIn?.effective_punch_at || firstIn?.server_received_at || null;
  const checkOutAt = lastOut?.effective_punch_at || lastOut?.server_received_at || null;
  const currentStatus = checkInAt ? (checkOutAt ? "COMPLETED" : "PUNCHED_IN") : "NOT_PUNCHED_IN";
  const employeeShiftName = employeeResult.data?.shift_name || "General";

  const availableShifts = ((shiftResult.data || []) as Array<{
    id: string;
    name: string;
    type: string;
    start_time: string;
    end_time: string;
    grace_mins: number;
    early_window_mins: number;
    min_work_before_out_mins: number;
    active: boolean;
    }>)
    .filter((row) => row.active !== false)
    .map((row) => ({
      name: row.name,
      type: row.type,
      startTime: row.start_time,
      endTime: row.end_time,
      graceMins: Number(row.grace_mins || 0),
      earlyWindowMins: Number(row.early_window_mins || 0),
      minWorkBeforeOutMins: Number(row.min_work_before_out_mins || 0),
    }));

  const defaultShifts = DEFAULT_COMPANY_SHIFTS.map((row) => ({
    name: row.name,
    type: row.type,
    startTime: row.start,
    endTime: row.end,
    graceMins: row.graceMins,
    earlyWindowMins: row.earlyWindowMins,
    minWorkBeforeOutMins: row.minWorkBeforeOutMins,
  }));

  const shiftPool = availableShifts.length ? availableShifts : defaultShifts;
  const resolvedShift = resolveShiftPolicyRuntime(policyContext.resolved.shift, {
    shiftName: employeeShiftName,
    shiftType: employeeShiftName,
    halfDayMinWorkMins: Number(companyResult.data?.half_day_min_work_mins || 240),
    loginAccessRule: companyResult.data?.login_access_rule,
  });
  const matchedShift =
    policyContext.resolved.shift
      ? {
          name: resolvedShift.shiftName,
          type: resolvedShift.shiftType,
          startTime: resolvedShift.shiftStartTime,
          endTime: resolvedShift.shiftEndTime,
          graceMins: resolvedShift.gracePeriod,
          earlyWindowMins: resolvedShift.earlyInAllowed,
          minWorkBeforeOutMins: resolvedShift.minimumWorkBeforePunchOut,
        }
      : findMatchingShiftRule(employeeShiftName, shiftPool);
  const shiftStartMin = matchedShift ? timeToMinutes(matchedShift.startTime) || 600 : 600;
  const effectiveScheduledWorkMin = matchedShift ? shiftDurationMinutes(matchedShift.startTime, matchedShift.endTime) : null;
  const resolvedAttendance = resolveAttendancePolicyRuntime(policyContext.resolved.attendance, {
    extraHoursCountingRule: companyResult.data?.extra_hours_policy,
  });
  const resolvedHoliday = resolveHolidayPolicyRuntime(policyContext.resolved.holiday_weekoff, {
    weeklyOffPolicy: companyResult.data?.weekly_off_policy,
    allowPunchOnHoliday: companyResult.data?.allow_punch_on_holiday !== false,
    allowPunchOnWeeklyOff: companyResult.data?.allow_punch_on_weekly_off !== false,
  });
  const extraHoursPolicy = normalizeExtraHoursPolicy(resolvedAttendance.extraHoursPolicy);
  const loginAccessRule = normalizeLoginAccessRule(resolvedShift.loginAccessRule);
  const actualWorkedMinutes = rawWorkedMinutes(checkInAt, checkOutAt);
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
    const punchAt = event.effective_punch_at || event.server_received_at;
    if (!punchAt) continue;
    const localDate = isoDateInIndia(punchAt);
    const bucket = groupedByDate.get(localDate) || [];
    bucket.push(event);
    groupedByDate.set(localDate, bucket);
  }
  const orderedDates = Array.from(groupedByDate.keys()).sort();
  for (const localDate of orderedDates) {
    if (localDate > today) continue;
    const bucket = groupedByDate.get(localDate) || [];
    const firstInForDay = bucket.find((row) => row.punch_type === "in") || null;
    const lastOutForDay = [...bucket].reverse().find((row) => row.punch_type === "out") || null;
    const metrics = buildAttendanceMetrics({
      checkInIso: firstInForDay?.effective_punch_at || firstInForDay?.server_received_at || null,
      checkOutIso: lastOutForDay?.effective_punch_at || lastOutForDay?.server_received_at || null,
      timeZone,
      shiftStart: matchedShift?.startTime || null,
      shiftEnd: matchedShift?.endTime || null,
      scheduledMinutes: effectiveScheduledWorkMin,
      graceMins: matchedShift?.graceMins || resolvedShift.gracePeriod || 10,
      halfDayMinWorkMins: normalizeHalfDayMinWorkMins(resolvedShift.halfDayMinWorkMins),
    });
    const qualifiesLateWithinLimit =
      metrics.lateMinutes > 0 && metrics.lateMinutes <= resolvedAttendance.latePunchUpToMinutes;
    const qualifiesEarlyWithinLimit =
      metrics.earlyGoMinutes > 0 && metrics.earlyGoMinutes <= resolvedAttendance.earlyGoUpToMinutes;
    if (qualifiesLateWithinLimit) lateCycleCount += 1;
    if (qualifiesEarlyWithinLimit) earlyCycleCount += 1;
    const decision = buildDailyAttendanceDecision({
      checkInIso: firstInForDay?.effective_punch_at || firstInForDay?.server_received_at || null,
      checkOutIso: lastOutForDay?.effective_punch_at || lastOutForDay?.server_received_at || null,
      timeZone,
      shiftStart: matchedShift?.startTime || null,
      shiftEnd: matchedShift?.endTime || null,
      scheduledMinutes: effectiveScheduledWorkMin,
      graceMins: matchedShift?.graceMins || resolvedShift.gracePeriod || 10,
      halfDayMinWorkMins: normalizeHalfDayMinWorkMins(resolvedShift.halfDayMinWorkMins),
      policy: resolvedAttendance,
      lateCycleOccurrenceCount: qualifiesLateWithinLimit ? lateCycleCount : 0,
      earlyGoCycleOccurrenceCount: qualifiesEarlyWithinLimit ? earlyCycleCount : 0,
    });
    if (decision.appliedRuleCode === "repeat_late") lateCycleCount = 0;
    if (decision.appliedRuleCode === "repeat_early_go") earlyCycleCount = 0;
  }
  const qualifiesLateWithinLimit =
    todayMetrics.lateMinutes > 0 && todayMetrics.lateMinutes <= resolvedAttendance.latePunchUpToMinutes;
  const qualifiesEarlyWithinLimit =
    todayMetrics.earlyGoMinutes > 0 && todayMetrics.earlyGoMinutes <= resolvedAttendance.earlyGoUpToMinutes;
  const todayDayType =
    holidayResult.data?.id
      ? "holiday"
      : isWeeklyOffDate(today, resolvedHoliday.weeklyOffPolicy)
        ? "weekly_off"
        : null;
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
      lateCycleOccurrenceCount: qualifiesLateWithinLimit ? lateCycleCount : 0,
      earlyGoCycleOccurrenceCount: qualifiesEarlyWithinLimit ? earlyCycleCount : 0,
    }),
    dayType: (checkInAt || checkOutAt) ? todayDayType : null,
    treatment:
      todayDayType === "holiday"
        ? (resolvedHoliday.holidayWorkedStatus as NonWorkingDayTreatment)
        : todayDayType === "weekly_off"
          ? (resolvedHoliday.weeklyOffWorkedStatus as NonWorkingDayTreatment)
          : null,
  });

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
      punchInAt: checkInAt,
      punchOutAt: checkOutAt,
      workingMinutes,
      nonWorkingDayTreatment: treatmentLabel,
    },
    config: {
      shiftName: matchedShift?.name || resolvedShift.shiftName || employeeShiftName,
      shiftStartMin,
      graceMins: matchedShift?.graceMins || resolvedShift.gracePeriod || 10,
      earlyWindowMin: matchedShift?.earlyWindowMins || resolvedShift.earlyInAllowed || 15,
      minWorkBeforeOutMin: matchedShift?.minWorkBeforeOutMins || resolvedShift.minimumWorkBeforePunchOut || 60,
      scheduledWorkMin: effectiveScheduledWorkMin || 0,
      extraHoursPolicy,
      halfDayMinWorkMins: normalizeHalfDayMinWorkMins(resolvedShift.halfDayMinWorkMins),
      loginAccessRule,
      weeklyOffPolicy: resolvedHoliday.weeklyOffPolicy,
      allowPunchOnHoliday: resolvedHoliday.allowPunchOnHoliday,
      allowPunchOnWeeklyOff: resolvedHoliday.allowPunchOnWeeklyOff,
    },
  });
}
