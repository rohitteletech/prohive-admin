import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { todayISOInIndia } from "@/lib/dateTime";
import { resolvePoliciesForEmployees } from "@/lib/companyPoliciesServer";
import { resolveHolidayPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { deriveCompOffEarnedDates, roundLeaveDays } from "@/lib/leaveAccrual";
import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";

const VIRTUAL_COMP_OFF_CODE = "COMP-OFF";

function addDaysToIsoDate(isoDate: string, days: number) {
  const start = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return "";
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token, {
    companyIdHint: req.headers.get("x-company-id") || req.cookies.get("prohive_company_id")?.value || "",
  });
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const asOfDate = todayISOInIndia();
  const currentYear = Number(asOfDate.slice(0, 4));

  const { data: employees, error: employeeError } = await context.admin
    .from("employees")
    .select("id,full_name,employee_code,department,shift_name,status")
    .eq("company_id", context.companyId)
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (employeeError) {
    return NextResponse.json({ error: employeeError.message || "Unable to load employees." }, { status: 400 });
  }

  const employeeRows = Array.isArray(employees) ? employees : [];
  if (employeeRows.length === 0) {
    return NextResponse.json({ rows: [], summary: { employees: 0, earnedDays: 0, approvedUsed: 0, pendingUsed: 0, available: 0 } });
  }

  const resolvedPoliciesByEmployee = await resolvePoliciesForEmployees(
    context.admin,
    context.companyId,
    employeeRows.map((row) => ({
      id: String(row.id || ""),
      department: row.department,
      shiftName: row.shift_name,
    })),
    asOfDate,
    ["holiday_weekoff"],
  );

  const resolvedHolidayByEmployee = new Map(
    employeeRows.map((row) => {
      const resolved = resolveHolidayPolicyRuntime(resolvedPoliciesByEmployee.get(String(row.id || ""))?.resolved?.holiday_weekoff || null);
      return [String(row.id || ""), resolved] as const;
    }),
  );

  const maxValidity = employeeRows.reduce((max, row) => {
    const resolved = resolvedHolidayByEmployee.get(String(row.id || ""));
    return Math.max(max, Number(resolved?.compOffValidityDays || 0));
  }, 0);

  if (maxValidity <= 0) {
    return NextResponse.json({
      rows: employeeRows.map((row) => ({
        employeeId: String(row.id || ""),
        employee: String(row.full_name || "Unknown"),
        employeeCode: String(row.employee_code || ""),
        department: String(row.department || "-"),
        earnedDays: 0,
        approvedUsed: 0,
        pendingUsed: 0,
        available: 0,
        validityDays: 0,
        recentEarnedDates: [],
      })),
      summary: { employees: employeeRows.length, earnedDays: 0, approvedUsed: 0, pendingUsed: 0, available: 0 },
    });
  }

  const rangeStart = addDaysToIsoDate(asOfDate, -maxValidity);
  const rangeEnd = addDaysToIsoDate(asOfDate, 1);

  const [attendanceResult, holidayResult, usageResult] = await Promise.all([
    context.admin
      .from("attendance_punch_events")
      .select("employee_id,effective_punch_at,server_received_at,approval_status")
      .eq("company_id", context.companyId)
      .in("approval_status", ["auto_approved", "approved"])
      .gte("server_received_at", `${rangeStart}T00:00:00.000Z`)
      .lt("server_received_at", `${rangeEnd}T00:00:00.000Z`),
    context.admin
      .from("company_holidays")
      .select("holiday_date")
      .eq("company_id", context.companyId)
      .gte("holiday_date", rangeStart)
      .lte("holiday_date", asOfDate),
    context.admin
      .from("employee_leave_requests")
      .select("employee_id,paid_days,days,status")
      .eq("company_id", context.companyId)
      .eq("leave_policy_code", VIRTUAL_COMP_OFF_CODE)
      .gte("from_date", `${currentYear}-01-01`)
      .lt("from_date", `${currentYear + 1}-01-01`),
  ]);

  if (attendanceResult.error) {
    return NextResponse.json({ error: attendanceResult.error.message || "Unable to load comp off attendance." }, { status: 400 });
  }
  if (holidayResult.error) {
    return NextResponse.json({ error: holidayResult.error.message || "Unable to load holiday markers." }, { status: 400 });
  }
  if (usageResult.error) {
    return NextResponse.json({ error: usageResult.error.message || "Unable to load comp off usage." }, { status: 400 });
  }

  const holidayDates = new Set(
    ((holidayResult.data || []) as Array<{ holiday_date: string }>).map((row) => String(row.holiday_date || "")).filter(Boolean),
  );

  const attendanceDatesByEmployee = new Map<string, Set<string>>();
  ((attendanceResult.data || []) as Array<{
    employee_id?: string | null;
    effective_punch_at?: string | null;
    server_received_at?: string | null;
  }>).forEach((row) => {
    const employeeId = String(row.employee_id || "");
    if (!employeeId) return;
    const isoDate = String(row.effective_punch_at || row.server_received_at || "").slice(0, 10);
    if (!isoDate) return;
    const bucket = attendanceDatesByEmployee.get(employeeId) || new Set<string>();
    bucket.add(isoDate);
    attendanceDatesByEmployee.set(employeeId, bucket);
  });

  const usageByEmployee = new Map<string, { approvedUsed: number; pendingUsed: number }>();
  ((usageResult.data || []) as Array<{
    employee_id?: string | null;
    paid_days?: number | null;
    days?: number | null;
    status?: string | null;
  }>).forEach((row) => {
    const employeeId = String(row.employee_id || "");
    if (!employeeId) return;
    const bucket = usageByEmployee.get(employeeId) || { approvedUsed: 0, pendingUsed: 0 };
    const consumed = Number((row.paid_days ?? row.days) || 0);
    if (row.status === "approved") bucket.approvedUsed += consumed;
    if (row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr") bucket.pendingUsed += consumed;
    usageByEmployee.set(employeeId, bucket);
  });

  const rows = employeeRows.map((row) => {
    const employeeId = String(row.id || "");
    const resolvedHoliday = resolvedHolidayByEmployee.get(employeeId);
    const validityDays = Math.max(Number(resolvedHoliday?.compOffValidityDays || 0), 0);
    const employeeRangeStart = addDaysToIsoDate(asOfDate, -validityDays);
    const validAttendanceDates = Array.from(attendanceDatesByEmployee.get(employeeId) || new Set<string>()).filter(
      (isoDate) => isoDate >= employeeRangeStart && isoDate <= asOfDate,
    );
    const earnedDates = deriveCompOffEarnedDates({
      attendanceDates: validAttendanceDates,
      holidayDates,
      weeklyOffPolicy: resolvedHoliday?.weeklyOffPolicy || "sunday_only",
      holidayWorkedStatus: (resolvedHoliday?.holidayWorkedStatus || "Grant Comp Off") as NonWorkingDayTreatment,
      weeklyOffWorkedStatus: (resolvedHoliday?.weeklyOffWorkedStatus || "Grant Comp Off") as NonWorkingDayTreatment,
    });
    const usage = usageByEmployee.get(employeeId) || { approvedUsed: 0, pendingUsed: 0 };
    const earnedDays = roundLeaveDays(earnedDates.size);
    const approvedUsed = roundLeaveDays(usage.approvedUsed);
    const pendingUsed = roundLeaveDays(usage.pendingUsed);
    const available = Math.max(roundLeaveDays(earnedDays - approvedUsed - pendingUsed), 0);

    return {
      employeeId,
      employee: String(row.full_name || "Unknown"),
      employeeCode: String(row.employee_code || ""),
      department: String(row.department || "-"),
      earnedDays,
      approvedUsed,
      pendingUsed,
      available,
      validityDays,
      recentEarnedDates: Array.from(earnedDates).sort((a, b) => b.localeCompare(a)).slice(0, 5),
    };
  });

  return NextResponse.json({
    rows,
    summary: {
      employees: rows.length,
      earnedDays: roundLeaveDays(rows.reduce((sum, row) => sum + row.earnedDays, 0)),
      approvedUsed: roundLeaveDays(rows.reduce((sum, row) => sum + row.approvedUsed, 0)),
      pendingUsed: roundLeaveDays(rows.reduce((sum, row) => sum + row.pendingUsed, 0)),
      available: roundLeaveDays(rows.reduce((sum, row) => sum + row.available, 0)),
    },
  });
}
