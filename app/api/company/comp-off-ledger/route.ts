import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { formatDisplayDate, todayISOInIndia } from "@/lib/dateTime";
import { resolvePoliciesForEmployees } from "@/lib/companyPoliciesServer";
import { resolveHolidayPolicyRuntime } from "@/lib/companyPolicyRuntime";
import { deriveCompOffEarnedDates, roundLeaveDays } from "@/lib/leaveAccrual";
import { fetchManualReviewResolutionMap } from "@/lib/manualReviewResolutions";
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

  const rangeStart = maxValidity > 0 ? addDaysToIsoDate(asOfDate, -maxValidity) : asOfDate;
  const rangeEnd = addDaysToIsoDate(asOfDate, 1);

  const [attendanceResult, holidayResult, usageResult, overrideResult] = await Promise.all([
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
      .select("id,employee_id,from_date,to_date,paid_days,days,status,submitted_at")
      .eq("company_id", context.companyId)
      .eq("leave_policy_code", VIRTUAL_COMP_OFF_CODE)
      .gte("from_date", `${currentYear}-01-01`)
      .lt("from_date", `${currentYear + 1}-01-01`),
    context.admin
      .from("employee_leave_balance_overrides")
      .select("id,employee_id,extra_days,reason,created_by,updated_at")
      .eq("company_id", context.companyId)
      .eq("leave_policy_code", VIRTUAL_COMP_OFF_CODE)
      .eq("year", currentYear),
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
  if (overrideResult.error) {
    return NextResponse.json({ error: overrideResult.error.message || "Unable to load comp off adjustments." }, { status: 400 });
  }
  const manualResolutionResult = await fetchManualReviewResolutionMap({
    admin: context.admin,
    companyId: context.companyId,
    employeeIds: employeeRows.map((row) => String(row.id || "")),
    startDate: rangeStart,
    endDate: asOfDate,
  });
  if (manualResolutionResult.error) {
    return NextResponse.json({ error: manualResolutionResult.error }, { status: 400 });
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
  const overrideByEmployee = new Map<
    string,
    { id: string; extraDays: number; reason: string; createdBy: string; updatedAt: string }
  >();
  const transactions: Array<{
    id: string;
    employeeId: string;
    employee: string;
    employeeCode: string;
    department: string;
    transactionDate: string;
    transactionDateLabel: string;
    kind: "Earned" | "Approved Use" | "Pending Use" | "Manual Adjustment";
    source: "Holiday" | "Weekly Off" | "Leave Request" | "Admin Override";
    days: number;
    note: string;
  }> = [];
  ((usageResult.data || []) as Array<{
    id?: string | null;
    employee_id?: string | null;
    from_date?: string | null;
    to_date?: string | null;
    paid_days?: number | null;
    days?: number | null;
    status?: string | null;
    submitted_at?: string | null;
  }>).forEach((row) => {
    const employeeId = String(row.employee_id || "");
    if (!employeeId) return;
    const bucket = usageByEmployee.get(employeeId) || { approvedUsed: 0, pendingUsed: 0 };
    const consumed = Number((row.paid_days ?? row.days) || 0);
    if (row.status === "approved") bucket.approvedUsed += consumed;
    if (row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr") bucket.pendingUsed += consumed;
    usageByEmployee.set(employeeId, bucket);

    const employeeRow = employeeRows.find((item) => String(item.id || "") === employeeId);
    if (!employeeRow) return;
    if (row.status === "approved" || row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr") {
      const statusLabel = row.status === "approved" ? "Approved Use" : "Pending Use";
      const transactionDate = String(row.from_date || row.submitted_at || "");
      transactions.push({
        id: `use-${String(row.id || `${employeeId}-${transactionDate}`)}`,
        employeeId,
        employee: String(employeeRow.full_name || "Unknown"),
        employeeCode: String(employeeRow.employee_code || ""),
        department: String(employeeRow.department || "-"),
        transactionDate,
        transactionDateLabel: formatDisplayDate(transactionDate),
        kind: statusLabel,
        source: "Leave Request",
        days: roundLeaveDays(consumed),
        note:
          row.from_date && row.to_date
            ? `${formatDisplayDate(String(row.from_date))} to ${formatDisplayDate(String(row.to_date))}`
            : "Comp off leave request",
      });
    }
  });

  ((overrideResult.data || []) as Array<{
    id?: string | null;
    employee_id?: string | null;
    extra_days?: number | null;
    reason?: string | null;
    created_by?: string | null;
    updated_at?: string | null;
  }>).forEach((row) => {
    const employeeId = String(row.employee_id || "");
    if (!employeeId) return;
    const adjustment = {
      id: String(row.id || ""),
      extraDays: roundLeaveDays(Number(row.extra_days || 0)),
      reason: String(row.reason || ""),
      createdBy: String(row.created_by || ""),
      updatedAt: String(row.updated_at || ""),
    };
    overrideByEmployee.set(employeeId, adjustment);

    const employeeRow = employeeRows.find((item) => String(item.id || "") === employeeId);
    if (!employeeRow || adjustment.extraDays === 0) return;
    transactions.push({
      id: `override-${adjustment.id || employeeId}`,
      employeeId,
      employee: String(employeeRow.full_name || "Unknown"),
      employeeCode: String(employeeRow.employee_code || ""),
      department: String(employeeRow.department || "-"),
      transactionDate: adjustment.updatedAt || `${currentYear}-01-01`,
      transactionDateLabel: formatDisplayDate(adjustment.updatedAt || `${currentYear}-01-01`),
      kind: "Manual Adjustment",
      source: "Admin Override",
      days: adjustment.extraDays,
      note: adjustment.reason || "Manual comp off adjustment",
    });
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
      manualReviewResolutionsByDate: new Map(
        Array.from(manualResolutionResult.byEmployeeDate.entries())
          .filter(([key]) => key.startsWith(`${employeeId}:`))
          .map(([key, value]) => [key.split(":")[1] || "", value]),
      ),
    });
    const usage = usageByEmployee.get(employeeId) || { approvedUsed: 0, pendingUsed: 0 };
    const adjustment = overrideByEmployee.get(employeeId);
    const earnedDays = roundLeaveDays(earnedDates.size);
    const approvedUsed = roundLeaveDays(usage.approvedUsed);
    const pendingUsed = roundLeaveDays(usage.pendingUsed);
    const manualAdjustmentDays = roundLeaveDays(adjustment?.extraDays || 0);
    const available = Math.max(roundLeaveDays(earnedDays + manualAdjustmentDays - approvedUsed - pendingUsed), 0);
    const sortedEarnedDates = Array.from(earnedDates).sort((a, b) => b.localeCompare(a));
    const recentEarnedRows = sortedEarnedDates.slice(0, 5).map((isoDate) => {
      const expiryDate = validityDays > 0 ? addDaysToIsoDate(isoDate, validityDays) : "";
      return {
        earnedDate: isoDate,
        expiryDate,
      };
    });
    const nextExpiry = validityDays > 0
      ? Array.from(earnedDates)
          .map((isoDate) => addDaysToIsoDate(isoDate, validityDays))
          .filter((isoDate) => Boolean(isoDate) && isoDate >= asOfDate)
          .sort((a, b) => a.localeCompare(b))[0] || ""
      : "";

    Array.from(earnedDates).forEach((isoDate) => {
      const expiryDate = validityDays > 0 ? addDaysToIsoDate(isoDate, validityDays) : "";
      transactions.push({
        id: `earned-${employeeId}-${isoDate}`,
        employeeId,
        employee: String(row.full_name || "Unknown"),
        employeeCode: String(row.employee_code || ""),
        department: String(row.department || "-"),
        transactionDate: isoDate,
        transactionDateLabel: formatDisplayDate(isoDate),
        kind: "Earned",
        source: holidayDates.has(isoDate) ? "Holiday" : "Weekly Off",
        days: 1,
        note: `${holidayDates.has(isoDate) ? "Worked on holiday" : "Worked on weekly off"}${expiryDate ? ` • Expires ${formatDisplayDate(expiryDate)}` : ""}`,
      });
    });

    return {
      employeeId,
      employee: String(row.full_name || "Unknown"),
      employeeCode: String(row.employee_code || ""),
      department: String(row.department || "-"),
      earnedDays,
      manualAdjustmentDays,
      approvedUsed,
      pendingUsed,
      available,
      validityDays,
      recentEarnedDates: sortedEarnedDates.slice(0, 5),
      recentEarnedRows,
      nextExpiry,
      overrideId: adjustment?.id || "",
      overrideReason: adjustment?.reason || "",
      overrideUpdatedAt: adjustment?.updatedAt || "",
      overrideCreatedBy: adjustment?.createdBy || "",
    };
  });

  return NextResponse.json({
    rows,
    transactions: transactions.sort((a, b) => {
      const dateCompare = String(b.transactionDate || "").localeCompare(String(a.transactionDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return a.employee.localeCompare(b.employee);
    }),
    summary: {
      employees: rows.length,
      earnedDays: roundLeaveDays(rows.reduce((sum, row) => sum + row.earnedDays, 0)),
      manualAdjustmentDays: roundLeaveDays(rows.reduce((sum, row) => sum + row.manualAdjustmentDays, 0)),
      approvedUsed: roundLeaveDays(rows.reduce((sum, row) => sum + row.approvedUsed, 0)),
      pendingUsed: roundLeaveDays(rows.reduce((sum, row) => sum + row.pendingUsed, 0)),
      available: roundLeaveDays(rows.reduce((sum, row) => sum + row.available, 0)),
    },
  });
}
