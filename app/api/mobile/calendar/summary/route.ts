import { NextRequest, NextResponse } from "next/server";
import { getMobileSessionContext } from "@/lib/mobileSession";
import { resolveHolidayPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import { isoDateInIndia, todayISOInIndia } from "@/lib/dateTime";
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
    ["holiday_weekoff"],
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
      .select("effective_punch_at,server_received_at,approval_status")
      .eq("company_id", session.employee.company_id)
      .eq("employee_id", session.employee.id)
      .in("approval_status", ["auto_approved", "approved"])
      .gte("server_received_at", `${attendanceQueryStart}T00:00:00.000Z`)
      .lt("server_received_at", `${attendanceQueryNextStart}T00:00:00.000Z`)
      .order("server_received_at", { ascending: true }),
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
  const weeklyOffPolicy = normalizeWeeklyOffPolicy(resolvedHoliday.weeklyOffPolicy);

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
    effective_punch_at: string | null;
    server_received_at: string;
    approval_status: string;
  }>;

  const holidayDates = new Set(holidayRows.map((row) => row.holiday_date));
  const holidayNamesByDate = new Map(
    holidayRows.map((row) => [row.holiday_date, row.name || row.type || "Holiday"] as const)
  );
  const weeklyOffDates = new Set<string>();
  const presentDates = new Set<string>();
  const nonWorkingDayTreatmentByDate = new Map<string, string>();
  const leaveDates = new Set<string>();
  const punchMomentsByDate = new Map<string, string[]>();

  attendanceRows.forEach((row) => {
    const punchAt = row.effective_punch_at || row.server_received_at;
    if (!punchAt) return;
    const isoDate = isoDateInIndia(punchAt);
    if (isoDate >= start && isoDate < nextStart) {
      presentDates.add(isoDate);
      const existingMoments = punchMomentsByDate.get(isoDate) || [];
      existingMoments.push(punchAt);
      punchMomentsByDate.set(isoDate, existingMoments);
      if (holidayDates.has(isoDate)) {
        nonWorkingDayTreatmentByDate.set(isoDate, resolvedHoliday.holidayWorkedStatus);
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
    status: "present" | "absent" | "leave" | "holiday" | "weekly_off";
    punchInAt: string | null;
    punchOutAt: string | null;
  }> = [];
  while (monthDate.getUTCMonth() === safeMonth - 1) {
    const iso = monthDate.toISOString().slice(0, 10);
    const isPastDate = iso < today;
    if (isWeeklyOffDate(iso, weeklyOffPolicy)) {
      weeklyOffDates.add(iso);
      if (presentDates.has(iso) && !holidayDates.has(iso)) {
        nonWorkingDayTreatmentByDate.set(iso, resolvedHoliday.weeklyOffWorkedStatus);
      }
    }

    let status: "present" | "absent" | "leave" | "holiday" | "weekly_off" | null = null;
    if (!isPastDate) {
      status = null;
    } else if (holidayDates.has(iso)) {
      status = nonWorkingDayTreatmentByDate.get(iso) === "Present + OT" ? "present" : "holiday";
    } else if (presentDates.has(iso) && weeklyOffDates.has(iso)) {
      status = nonWorkingDayTreatmentByDate.get(iso) === "Present + OT" ? "present" : "weekly_off";
    } else if (presentDates.has(iso)) {
      status = "present";
    } else if (leaveDates.has(iso)) {
      status = "leave";
    } else if (weeklyOffDates.has(iso)) {
      status = "weekly_off";
    } else if (isPastDate) {
      status = "absent";
    }

    if (status) {
      const punches = (punchMomentsByDate.get(iso) || []).slice().sort();
      const punchInAt = punches[0] || null;
      const punchOutAt = punches.length >= 2 ? punches[punches.length - 1] : null;
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
      status: "present" | "absent" | "leave" | "holiday" | "weekly_off" | null;
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
      status: "present" | "absent" | "leave" | "holiday" | "weekly_off" | null;
      dots: Array<"green" | "yellow" | "red">;
      chipText: string;
    }> = [];
    for (let i = 0; i < 7; i += 1) {
      const iso = cursor.toISOString().slice(0, 10);
      const status = statusByDate.get(iso) || null;
      const dots: Array<"green" | "yellow" | "red"> = [];
      if (status === "present") dots.push("green");
      if (status === "holiday" || status === "weekly_off") dots.push("yellow");
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
