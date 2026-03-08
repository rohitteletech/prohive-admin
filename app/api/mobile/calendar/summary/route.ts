import { NextRequest, NextResponse } from "next/server";
import { getMobileSessionContext } from "@/lib/mobileSession";
import { isoDateInIndia } from "@/lib/dateTime";

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

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    companyId?: string;
    deviceId?: string;
    year?: number;
    month?: number;
  };

  const session = await getMobileSessionContext({
    employeeId: body.employeeId,
    companyId: body.companyId,
    deviceId: body.deviceId,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const now = new Date();
  const year = Number.isFinite(body.year) ? Number(body.year) : now.getUTCFullYear();
  const month = Number.isFinite(body.month) ? Number(body.month) : now.getUTCMonth() + 1;
  const safeMonth = month >= 1 && month <= 12 ? month : now.getUTCMonth() + 1;
  const { start, nextStart } = monthRange(year, safeMonth);
  const today = isoDateInIndia(now.toISOString());

  const yearStart = `${year}-01-01`;
  const yearNextStart = `${year + 1}-01-01`;

  const [monthHolidayResult, yearHolidayResult, upcomingHolidayResult, leaveResult, attendanceResult] = await Promise.all([
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
      .gte("server_received_at", `${start}T00:00:00.000Z`)
      .lt("server_received_at", `${nextStart}T00:00:00.000Z`)
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
  const weeklyOffDates = new Set<string>();
  const presentDates = new Set<string>();
  const leaveDates = new Set<string>();

  attendanceRows.forEach((row) => {
    const punchAt = row.effective_punch_at || row.server_received_at;
    if (!punchAt) return;
    const isoDate = isoDateInIndia(punchAt);
    if (isoDate >= start && isoDate < nextStart) {
      presentDates.add(isoDate);
    }
  });

  leaveRows.forEach((row) => {
    if (row.status !== "pending" && row.status !== "approved") return;
    if (!row.from_date || !row.to_date) return;
    let cursor = new Date(`${row.from_date}T00:00:00.000Z`);
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
  const monthlyStatuses: Array<{ date: string; status: "present" | "absent" | "leave" | "holiday" | "weekly_off" }> = [];
  while (monthDate.getUTCMonth() === safeMonth - 1) {
    const iso = monthDate.toISOString().slice(0, 10);
    if (monthDate.getUTCDay() === 0) {
      weeklyOffDates.add(iso);
    }

    let status: "present" | "absent" | "leave" | "holiday" | "weekly_off" | null = null;
    if (holidayDates.has(iso)) {
      status = "holiday";
    } else if (leaveDates.has(iso)) {
      status = "leave";
    } else if (weeklyOffDates.has(iso)) {
      status = "weekly_off";
    } else if (presentDates.has(iso)) {
      status = "present";
    } else if (iso <= today) {
      status = "absent";
    }

    if (status) {
      monthlyStatuses.push({ date: iso, status });
    }
    monthDate.setUTCDate(monthDate.getUTCDate() + 1);
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
  });
}
