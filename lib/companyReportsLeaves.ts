import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISOInIndia } from "@/lib/dateTime";
import { resolveLeavePolicyRowsRuntime, resolveLeaveTypesRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployees } from "@/lib/companyPoliciesServer";
import {
  computeLeaveEntitlement,
  fetchLeaveCarryForwardDays,
  getLeaveCycleBounds,
  fetchLeaveOverrideDays,
  fetchLeaveUsageForCycle,
  normalizeAccrualMode,
  roundLeaveDays,
} from "@/lib/leaveAccrual";

type AdminClientLike = SupabaseClient;

export type LeaveReportRow = {
  id: string;
  employee: string;
  employeeCode: string;
  department: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  paidDays: number;
  unpaidDays: number;
  status: "pending" | "pending_manager" | "pending_hr" | "approved" | "rejected";
  availableBalance: number;
  submittedAt: string;
};

export type LeaveReportInput = {
  mode?: string;
  monthKey?: string;
  startDate?: string;
  endDate?: string;
  employeeQuery?: string;
  department?: string;
  status?: string;
};

function normalizeDateParam(value: string | null | undefined) {
  const date = (value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeMonthKey(value: string | null | undefined) {
  const monthKey = (value || "").trim();
  return /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : null;
}

export function parseLeaveScope(input: {
  mode?: string;
  monthKey?: string;
  startDate?: string;
  endDate?: string;
}) {
  if (input.mode === "date_range") {
    const startDate = normalizeDateParam(input.startDate);
    const endDate = normalizeDateParam(input.endDate);
    if (!startDate || !endDate) return { ok: false as const, error: "Valid date range is required." };
    if (endDate < startDate) return { ok: false as const, error: "End date cannot be before start date." };
    return { ok: true as const, startDate, endDate };
  }

  const monthKey = normalizeMonthKey(input.monthKey);
  if (!monthKey) return { ok: false as const, error: "Valid month is required." };
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  return { ok: true as const, startDate, endDate };
}

export async function getLeaveReportData(params: {
  admin: AdminClientLike;
  companyId: string;
  input: LeaveReportInput;
}) {
  const scope = parseLeaveScope(params.input);
  if (!scope.ok) {
    return { ok: false as const, status: 400, error: scope.error };
  }

  const employeeQuery = String(params.input.employeeQuery || "").trim().toLowerCase();
  const departmentFilter = String(params.input.department || "all").trim().toLowerCase();
  const statusFilter = String(params.input.status || "all").trim().toLowerCase();
  const requestResult = await params.admin
    .from("employee_leave_requests")
    .select(
      "id,employee_id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,paid_days,unpaid_days,status,submitted_at"
      + ",employees(full_name,employee_code,department)"
    )
    .eq("company_id", params.companyId)
    .gte("submitted_at", `${scope.startDate}T00:00:00.000Z`)
    .lt("submitted_at", `${scope.endDate}T23:59:59.999Z`)
    .order("submitted_at", { ascending: false });

  if (requestResult.error) {
    return { ok: false as const, status: 400, error: requestResult.error.message || "Unable to load leave requests." };
  }
  const requestRows = Array.isArray(requestResult.data)
    ? (requestResult.data as unknown as Array<Record<string, unknown>>)
    : [];
  const employeeSeedRows: Array<{ id: string; department: string }> = requestRows.length > 0
    ? Array.from(
        new Map<string, { id: string; department: string }>(
          requestRows.map((row) => [
            String(row.employee_id || ""),
            {
              id: String(row.employee_id || ""),
              department: String(((row.employees || {}) as unknown as Record<string, unknown>).department || ""),
            },
          ]),
        ).values(),
      ).filter((row) => Boolean(row.id))
    : [];
  const resolvedPoliciesByEmployee = await resolvePoliciesForEmployees(
    params.admin,
    params.companyId,
    employeeSeedRows,
    scope.startDate,
    ["leave"],
  );
  const cycleAnchorDate = scope.startDate;
  const balanceCache = new Map<string, number>();

  async function getAvailableBalance(employeeId: string, leavePolicyCode: string) {
    const leaveCycleType =
      resolvedPoliciesByEmployee.get(employeeId)?.resolved?.leave?.configJson?.leaveCycleType === "Financial Year"
        ? "Financial Year"
        : "Calendar Year";
    const cacheKey = `${employeeId}:${leavePolicyCode}:${cycleAnchorDate}:${leaveCycleType}`;
    if (balanceCache.has(cacheKey)) return balanceCache.get(cacheKey) || 0;
    const currentCycleBounds = getLeaveCycleBounds(cycleAnchorDate, leaveCycleType);
    const previousCycleEndDate = new Date(`${currentCycleBounds.start}T00:00:00.000Z`);
    previousCycleEndDate.setUTCDate(previousCycleEndDate.getUTCDate() - 1);
    const previousCycleEnd = previousCycleEndDate.toISOString().slice(0, 10);

    const resolvedLeavePolicy = resolvedPoliciesByEmployee.get(employeeId)?.resolved?.leave || null;
    const resolvedLeaveTypes = resolveLeaveTypesRuntime(resolvedLeavePolicy);
    const resolvedLeaveRows = resolveLeavePolicyRowsRuntime(resolvedLeavePolicy);
    const previousResolvedPoliciesByEmployee = await resolvePoliciesForEmployees(
      params.admin,
      params.companyId,
      [{ id: employeeId, department: resolvedPoliciesByEmployee.get(employeeId)?.department || "" }],
      previousCycleEnd,
      ["leave"],
    );
    const previousResolvedLeaveTypes = resolveLeaveTypesRuntime(
      previousResolvedPoliciesByEmployee.get(employeeId)?.resolved?.leave || null,
    );
    const resolvedPolicy = resolvedLeaveTypes.find((row) => row.code === leavePolicyCode);
    const policy = resolvedLeaveRows.find((row) => row.code === leavePolicyCode);
    if (!policy) {
      balanceCache.set(cacheKey, 0);
      return 0;
    }

    const [usageResult, overrideResult] = await Promise.all([
      fetchLeaveUsageForCycle({
        admin: params.admin,
        companyId: params.companyId,
        employeeId,
        leavePolicyCode,
        asOfIsoDate: cycleAnchorDate,
        leaveCycleType,
      }),
      fetchLeaveOverrideDays({
        admin: params.admin,
        companyId: params.companyId,
        employeeId,
        leavePolicyCode,
        asOfIsoDate: cycleAnchorDate,
        leaveCycleType,
      }),
    ]);

    if (usageResult.error || overrideResult.error) {
      balanceCache.set(cacheKey, 0);
      return 0;
    }
    const carryForwardResult = await fetchLeaveCarryForwardDays({
      admin: params.admin,
      companyId: params.companyId,
      employeeId,
      leavePolicyCode,
      previousCycleLeavePolicyCode: previousResolvedLeaveTypes.find((row) => row.code === leavePolicyCode)?.code || "",
      previousCyclePolicyEffectiveFrom: previousResolvedPoliciesByEmployee.get(employeeId)?.resolved?.leave?.effectiveFrom,
      previousCycleAnnualQuota: previousResolvedLeaveTypes.find((row) => row.code === leavePolicyCode)?.annualQuota ?? 0,
      previousCycleAccrualMode:
        previousResolvedLeaveTypes.find((row) => row.code === leavePolicyCode)?.accrualRule === "Yearly Upfront"
          ? "upfront"
          : "monthly",
      carryForwardAllowed: Number(policy.carry_forward || 0) > 0,
      maximumCarryForwardDays: Number(policy.carry_forward || 0),
      carryForwardExpiryDays:
        resolvedPolicy?.carryForwardExpiryDays || 0,
      asOfIsoDate: cycleAnchorDate,
      leaveCycleType,
    });
    if (carryForwardResult.error) {
      balanceCache.set(cacheKey, 0);
      return 0;
    }

    const entitlement = computeLeaveEntitlement({
      annualQuota: Number(policy.annual_quota || 0),
      carryForward: carryForwardResult.effectiveDays,
      accrualMode: normalizeAccrualMode(policy.accrual_mode),
      overrideDays: overrideResult.overrideDays,
      asOfIsoDate: todayISOInIndia(),
      leaveCycleType,
    });
    const available = Math.max(roundLeaveDays(entitlement.accruedTotal - usageResult.approvedUsed - usageResult.pendingUsed), 0);
    balanceCache.set(cacheKey, available);
    return available;
  }

  const rows: LeaveReportRow[] = [];

  for (const row of requestRows) {
    const employees = (row.employees || {}) as unknown as Record<string, unknown>;
    const employeeId = String(row.employee_id || "");
    const leavePolicyCode = String(row.leave_policy_code || "");
    const availableBalance = await getAvailableBalance(employeeId, leavePolicyCode);

    rows.push({
      id: String(row.id || ""),
      employee: String(employees.full_name || "Unknown"),
      employeeCode: String(employees.employee_code || ""),
      department: String(employees.department || "-"),
      leaveType: String(row.leave_name_snapshot || leavePolicyCode || ""),
      fromDate: String(row.from_date || ""),
      toDate: String(row.to_date || ""),
      days: Number(row.days || 0),
      paidDays: Number((row.paid_days ?? row.days) || 0),
      unpaidDays: Number(row.unpaid_days || 0),
      status:
        row.status === "approved" ||
        row.status === "rejected" ||
        row.status === "pending_manager" ||
        row.status === "pending_hr"
          ? row.status
          : "pending",
      availableBalance,
      submittedAt: String(row.submitted_at || ""),
    });
  }

  const filteredRows = rows.filter((row) => {
    const matchesEmployee = employeeQuery
      ? `${row.employee} ${row.employeeCode} ${row.leaveType} ${row.department}`.toLowerCase().includes(employeeQuery)
      : true;
    const matchesDepartment = departmentFilter === "all" ? true : row.department.trim().toLowerCase() === departmentFilter;
    const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter;
    return matchesEmployee && matchesDepartment && matchesStatus;
  });

  return {
    ok: true as const,
    scope: { startDate: scope.startDate, endDate: scope.endDate },
    rows: filteredRows,
    summary: {
      total: filteredRows.length,
      pending: filteredRows.filter((row) => row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr").length,
      approved: filteredRows.filter((row) => row.status === "approved").length,
      rejected: filteredRows.filter((row) => row.status === "rejected").length,
      totalAvailableBalance: roundLeaveDays(filteredRows.reduce((sum, row) => sum + row.availableBalance, 0)),
    },
  };
}

function csvEscape(value: string | number) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function toLeaveCsv(rows: LeaveReportRow[]) {
  const headers = [
    "Employee",
    "Employee Code",
    "Department",
    "Leave Type",
    "From Date",
    "To Date",
    "Days",
    "Paid Days",
    "Unpaid Days",
    "Available Balance",
    "Status",
    "Submitted At",
  ];

  const lines = rows.map((row) =>
    [
      row.employee,
      row.employeeCode,
      row.department,
      row.leaveType,
      row.fromDate,
      row.toDate,
      row.days,
      row.paidDays,
      row.unpaidDays,
      row.availableBalance,
      row.status,
      row.submittedAt,
    ]
      .map(csvEscape)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}
