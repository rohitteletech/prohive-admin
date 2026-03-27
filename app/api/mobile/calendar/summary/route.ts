import { NextRequest, NextResponse } from "next/server";
import { getMobileSessionContext } from "@/lib/mobileSession";
import { resolveAttendancePolicyRuntime, resolveHolidayPolicyRuntime, resolveShiftPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import { isoDateInIndia, todayISOInIndia } from "@/lib/dateTime";
import { shiftDurationMinutes } from "@/lib/shiftWorkPolicy";
import {
  applyNonWorkingDayTreatment,
  buildAttendanceMetrics,
  buildDailyAttendanceDecision,
  type NonWorkingDayTreatment,
} from "@/lib/attendancePolicy";
import { isWeeklyOffDate, normalizeWeeklyOffPolicy } from "@/lib/weeklyOff";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function monthRange(year: number, month: number) {
  const start = `${year}-${pad2(month)}-01`;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextStart = `${nextMonthYear}-${pad2(nextMonth)}-01`;
  return { start, nextStart };
}

function parseIsoParts(iso: string) {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return { year, month, day };
}

function addDaysToIso(iso: string, days: number) {
  const { year, month, day } = parseIsoParts(iso);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function clampIsoToRange(iso: string, start: string, end: string) {
  if (iso < start) return start;
  if (iso > end) return end;
  return iso;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionToken?: string;
    year?: number;
    month?: number;
  };

  const session = await getMobileSessionContext({
    sessionToken: body.sessionToken,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const today = todayISOInIndia();
  const { year: indiaYear, month: indiaMonth } = parseIsoParts(today);
  const year = Number.isFinite(body.year) ? Number(body.year) : indiaYear;
  const month = Number.isFinite(body.month) ? Number(body.month) : indiaMonth;
  const safeMonth = month >= 1 && month <= 12 ? month : indiaMonth;
  const { start, nextStart } = monthRange(year, safeMonth);
  const monthEnd = addDaysToIso(nextStart, -1);
  const attendanceQueryStart = addDaysToIso(start, -1);
  const attendanceQueryNextStart = addDaysToIso(nextStart, 1);
  const policyContext = await resolvePoliciesForEmployee(
    session.admin,
    session.employee.company_id,
    session.employee.id,
    start,
    ["shift", "attendance", "holiday_weekoff"],
  );

  const yearStart = `${year}-01-01`;
  const yearNextStart = `${year + 1}-01-01`;

  const [yearHolidayResult, monthHolidayResult, upcomingHolidayResult, leaveResult, attendanceResult] = await Promise.all([
    session.admin
      .from("company_holidays")
      .select("id,holiday_date,name,type")
      .eq("company_id", session.employee.company_id)
      .gte("holiday_date", yearStart)
      .lt("holiday_date", yearNextStart)
      .order("holiday_date", { ascending: true }),
    session.admin
      .from("company_holidays")
      .select("id,holiday_date,name,type")
      .eq("company_id", session.employee.company_id)
      .gte("holiday_date", start)
      .lt("holiday_date", nextStart)
      .order("holiday_date", { ascending: true }),
    session.admin
      .from("company_holidays")
      .select("id,holiday_date,name,type")
      .eq("company_id", session.employee.company_id)
      .gte("holiday_date", today)
      .order("holiday_date", { ascending: true })
      .limit(8),
    session.admin
      .from("employee_leave_requests")
      .select("id,from_date,to_date,status,leave_name_snapshot,days")
      .eq("company_id", session.employee.company_id)
      .eq("employee_id", session.employee.id)
      .lte("from_date", nextStart)
      .gte("to_date", start)
      .order("from_date", { ascending: true }),
    session.admin
      .from("attendance_punch_events")
      .select("punch_type,effective_punch_at,server_received_at,approval_status")
      .eq("company_id", session.employee.company_id)
      .eq("employee_id", session.employee.id)
      .in("approval_status", ["auto_approved", "approved"])
      .gte("effective_punch_at", `${attendanceQueryStart}T00:00:00.000Z`)
      .lt("effective_punch_at", `${attendanceQueryNextStart}T00:00:00.000Z`)
      .order("effective_punch_at", { ascending: true }),
  ]);

  if (monthHolidayResult.error) {
    return NextResponse.json({ error: monthHolidayResult.error.message || "Unable to load holidays." }, { status: 400 });
  }
  if (upcomingHolidayResult.error) {
    return NextResponse.json(
      { error: upcomingHolidayResult.error.message || "Unable to load upcoming holidays." },
      { status: 400 }
    );
  }
  if (yearHolidayResult.error) {
    return NextResponse.json({ error: yearHolidayResult.error.message || "Unable to load yearly holidays." }, { status: 400 });
  }
  if (leaveResult.error) {
    return NextResponse.json({ error: leaveResult.error.message || "Unable to load leave markers." }, { status: 400 });
  }
  if (attendanceResult.error) {
    return NextResponse.json(
      { error: attendanceResult.error.message || "Unable to load attendance markers." },
      { status: 400 }
    );
  }

  const resolvedHoliday = resolveHolidayPolicyRuntime(policyContext.resolved.holiday_weekoff);
  const resolvedShift = resolveShiftPolicyRuntime(policyContext.resolved.shift, {
    shiftName: policyContext.employee.shiftName || "General Shift",
  });
  const resolvedAttendance = resolveAttendancePolicyRuntime(policyContext.resolved.attendance);
  const weeklyOffPolicy = normalizeWeeklyOffPolicy(resolvedHoliday.weeklyOffPolicy);
  const scheduledMinutes = shiftDurationMinutes(resolvedShift.shiftStartTime, resolvedShift.shiftEndTime);

  const holidayRows = (monthHolidayResult.data || []) as Array<{
    id: string;
    holiday_date: string;
    name: string | null;
    type: string | null;
  }>;
  const leaveRows = (leaveResult.data || []) as Array<{
    id: string;
    from_date: string;
    to_date: string;
    status: string | null;
    leave_name_snapshot: string | null;
    days: number | null;
  }>;
  const attendanceRows = (attendanceResult.data || []) as Array<{
    punch_type: "in" | "out";
    effective_punch_at: string | null;
    server_received_at: string;
    approval_status: string;
  }>;

  const holidayDates = new Set(holidayRows.map((row) => row.holiday_date));
  const holidayNamesByDate = new Map(
    holidayRows.map((row) => [row.holiday_date, row.name || row.type || "Holiday"] as const)
  );
  const weeklyOffDates = new Set<string>();
  const nonWorkingDayTreatmentByDate = new Map<string, NonWorkingDayTreatment>();
  const leaveDates = new Set<string>();
  const attendanceByDate = new Map<string, typeof attendanceRows>();

  attendanceRows.forEach((row) => {
    const punchAt = row.effective_punch_at || row.server_received_at;
    if (!punchAt) return;
    const isoDate = isoDateInIndia(punchAt);
    if (isoDate >= start && isoDate < nextStart) {
      const existingRows = attendanceByDate.get(isoDate) || [];
      existingRows.push(row);
      attendanceByDate.set(isoDate, existingRows);
      if (holidayDates.has(isoDate)) {
        nonWorkingDayTreatmentByDate.set(isoDate, resolvedHoliday.holidayWorkedStatus as NonWorkingDayTreatment);
      }
    }
  });

  leaveRows.forEach((row) => {
    if (row.status !== "pending" && row.status !== "approved") return;
    if (!row.from_date || !row.to_date) return;
    const cursor = new Date(`${row.from_date}T00:00:00.000Z`);
    const end = new Date(`${row.to_date}T00:00:00.000Z`);
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      if (iso >= start && iso < nextStart) {
        leaveDates.add(iso);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  });

  const monthDate = new Date(Date.UTC(year, safeMonth - 1, 1));
  const monthlyStatuses: Array<{
    date: string;
    status:
      | "present"
      | "late"
      | "half_day"
      | "absent"
      | "leave"
      | "holiday"
      | "weekly_off"
      | "off_day_worked"
      | "manual_review";
    punchInAt: string | null;
    punchOutAt: string | null;
  }> = [];
  let lateCycleCount = 0;
  let earlyGoCycleCount = 0;
  while (monthDate.getUTCMonth() === safeMonth - 1) {
    const iso = monthDate.toISOString().slice(0, 10);
    const isPastDate = iso < today;
    if (isWeeklyOffDate(iso, weeklyOffPolicy)) {
      weeklyOffDates.add(iso);
      if (attendanceByDate.has(iso) && !holidayDates.has(iso)) {
        nonWorkingDayTreatmentByDate.set(iso, resolvedHoliday.weeklyOffWorkedStatus as NonWorkingDayTreatment);
      }
    }

    let status:
      | "present"
      | "late"
      | "half_day"
      | "absent"
      | "leave"
      | "holiday"
      | "weekly_off"
      | "off_day_worked"
      | "manual_review"
      | null = null;
    let punchInAt: string | null = null;
    let punchOutAt: string | null = null;
    const dayEvents = (attendanceByDate.get(iso) || []).slice().sort((left, right) => {
      const leftTime = new Date(left.effective_punch_at || left.server_received_at).getTime();
      const rightTime = new Date(right.effective_punch_at || right.server_received_at).getTime();
      return leftTime - rightTime;
    });

    if (!isPastDate) {
      status = null;
    } else if (dayEvents.length > 0) {
      const firstIn = dayEvents.find((row) => row.punch_type === "in") || null;
      const lastOut = [...dayEvents].reverse().find((row) => row.punch_type === "out") || null;
      punchInAt = firstIn?.effective_punch_at || firstIn?.server_received_at || null;
      punchOutAt = lastOut?.effective_punch_at || lastOut?.server_received_at || null;

      const isHoliday = holidayDates.has(iso);
      const isWeeklyOff = !isHoliday && weeklyOffDates.has(iso);
      const metrics = buildAttendanceMetrics({
        checkInIso: punchInAt,
        checkOutIso: punchOutAt,
        timeZone: "Asia/Kolkata",
        shiftStart: resolvedShift.shiftStartTime,
        shiftEnd: resolvedShift.shiftEndTime,
        scheduledMinutes,
        graceMins: resolvedShift.gracePeriod,
        halfDayMinWorkMins: resolvedShift.halfDayMinWorkMins,
      });
      const countsTowardLateCycle =
        !isHoliday &&
        !isWeeklyOff &&
        metrics.lateMinutes > 0 &&
        metrics.lateMinutes <= resolvedAttendance.latePunchUpToMinutes;
      const countsTowardEarlyGoCycle =
        !isHoliday &&
        !isWeeklyOff &&
        metrics.earlyGoMinutes > 0 &&
        metrics.earlyGoMinutes <= resolvedAttendance.earlyGoUpToMinutes;

      if (countsTowardLateCycle) lateCycleCount += 1;
      if (countsTowardEarlyGoCycle) earlyGoCycleCount += 1;

      const baseDecision = buildDailyAttendanceDecision({
        checkInIso: punchInAt,
        checkOutIso: punchOutAt,
        timeZone: "Asia/Kolkata",
        shiftStart: resolvedShift.shiftStartTime,
        shiftEnd: resolvedShift.shiftEndTime,
        scheduledMinutes,
        graceMins: resolvedShift.gracePeriod,
        halfDayMinWorkMins: resolvedShift.halfDayMinWorkMins,
        policy: resolvedAttendance,
        lateCycleOccurrenceCount: countsTowardLateCycle ? lateCycleCount : 0,
        earlyGoCycleOccurrenceCount: countsTowardEarlyGoCycle ? earlyGoCycleCount : 0,
      });
      const { decision } = applyNonWorkingDayTreatment({
        decision: baseDecision,
        dayType: isHoliday ? "holiday" : isWeeklyOff ? "weekly_off" : null,
        treatment: nonWorkingDayTreatmentByDate.get(iso) || null,
      });

      if (baseDecision.resetLateCycle) lateCycleCount = 0;
      if (baseDecision.resetEarlyGoCycle) earlyGoCycleCount = 0;

      status = decision.status;
    } else if (leaveDates.has(iso)) {
      status = "leave";
    } else if (holidayDates.has(iso)) {
      status = "holiday";
    } else if (weeklyOffDates.has(iso)) {
      status = "weekly_off";
    } else if (isPastDate) {
      status = "absent";
    }

    if (status) {
      monthlyStatuses.push({
        date: iso,
        status,
        punchInAt,
        punchOutAt,
      });
    }
    monthDate.setUTCDate(monthDate.getUTCDate() + 1);
  }

  const leaveBands = leaveRows
    .filter((row) => row.status === "pending" || row.status === "approved")
    .map((row) => {
      const from = clampIsoToRange(row.from_date, start, monthEnd);
      const to = clampIsoToRange(row.to_date, start, monthEnd);
      return {
        id: row.id,
        fromDate: from,
        toDate: to,
        text: row.leave_name_snapshot || "Leave",
        status: row.status || "pending",
      };
    })
    .filter((row) => row.fromDate <= row.toDate);

  const statusByDate = new Map(monthlyStatuses.map((entry) => [entry.date, entry.status] as const));
  const firstCell = new Date(`${start}T00:00:00.000Z`);
  firstCell.setUTCDate(firstCell.getUTCDate() - firstCell.getUTCDay());
  const lastCell = new Date(`${monthEnd}T00:00:00.000Z`);
  lastCell.setUTCDate(lastCell.getUTCDate() + (6 - lastCell.getUTCDay()));

  const weeks: Array<
    Array<{
      date: string;
      day: number;
      inMonth: boolean;
      status:
        | "present"
        | "late"
        | "half_day"
        | "absent"
        | "leave"
        | "holiday"
        | "weekly_off"
        | "off_day_worked"
        | "manual_review"
        | null;
      dots: Array<"green" | "yellow" | "red">;
      chipText: string;
    }>
  > = [];
  const cursor = new Date(firstCell.toISOString());
  while (cursor <= lastCell) {
    const week: Array<{
        date: string;
        day: number;
        inMonth: boolean;
        status:
          | "present"
          | "late"
          | "half_day"
          | "absent"
          | "leave"
          | "holiday"
          | "weekly_off"
          | "off_day_worked"
          | "manual_review"
          | null;
        dots: Array<"green" | "yellow" | "red">;
        chipText: string;
      }> = [];
    for (let i = 0; i < 7; i += 1) {
      const iso = cursor.toISOString().slice(0, 10);
      const status = statusByDate.get(iso) || null;
      const dots: Array<"green" | "yellow" | "red"> = [];
      if (status === "present" || status === "late" || status === "half_day") dots.push("green");
      if (status === "holiday" || status === "weekly_off") dots.push("yellow");
      if (status === "off_day_worked" || status === "manual_review") dots.push("yellow");
      if (status === "absent") dots.push("red");
      const treatment = nonWorkingDayTreatmentByDate.get(iso) || "";
      week.push({
        date: iso,
        day: cursor.getUTCDate(),
        inMonth: iso >= start && iso < nextStart,
        status,
        dots,
        chipText: treatment && treatment !== "Present + OT" ? treatment : holidayNamesByDate.get(iso) || "",
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  return NextResponse.json({
    month: {
      year,
      month: safeMonth,
      start,
      nextStart,
    },
    holidays: holidayRows.map((row) => ({
      id: row.id,
      date: row.holiday_date,
      name: row.name || "",
      type: row.type || "",
    })),
    yearHolidays: (yearHolidayResult.data || []).map((row) => ({
      id: row.id,
      date: row.holiday_date,
      name: row.name || "",
      type: row.type || "",
    })),
    upcomingHolidays: (upcomingHolidayResult.data || []).map((row) => ({
      id: row.id,
      date: row.holiday_date,
      name: row.name || "",
      type: row.type || "",
    })),
    leaveMarkers: leaveRows.map((row) => ({
      id: row.id,
      fromDate: row.from_date,
      toDate: row.to_date,
      status: row.status || "pending",
      leaveName: row.leave_name_snapshot || "Leave",
      days: Number(row.days || 0),
    })),
    weeklyOffDates: Array.from(weeklyOffDates).sort(),
    monthlyStatuses,
    weeklyOffPolicy,
    calendarUi: {
      weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      monthLabel: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(year, safeMonth - 1, 1))
      ),
      weeks,
      leaveBands,
    },
  });
}
