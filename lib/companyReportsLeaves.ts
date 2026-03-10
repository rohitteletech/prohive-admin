import { todayISOInIndia } from "@/lib/dateTime";
import {
  computeLeaveEntitlement,
  fetchLeaveOverrideDays,
  fetchLeaveUsageForYear,
  normalizeAccrualMode,
  roundLeaveDays,
} from "@/lib/leaveAccrual";

type AdminClientLike = {
  from: (table: string) => any;
};

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
  status: "pending" | "approved" | "rejected";
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
  const year = Number(scope.startDate.slice(0, 4));

  const [requestResult, policyResult] = await Promise.all([
    params.admin
      .from("employee_leave_requests")
      .select(
        "id,employee_id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,paid_days,unpaid_days,status,submitted_at"
        + ",employees(full_name,employee_code,department)"
      )
      .eq("company_id", params.companyId)
      .gte("submitted_at", `${scope.startDate}T00:00:00.000Z`)
      .lt("submitted_at", `${scope.endDate}T23:59:59.999Z`)
      .order("submitted_at", { ascending: false }),
    params.admin
      .from("company_leave_policies")
      .select("id,name,code,annual_quota,carry_forward,accrual_mode,active")
      .eq("company_id", params.companyId)
      .eq("active", true),
  ]);

  if (requestResult.error) {
    return { ok: false as const, status: 400, error: requestResult.error.message || "Unable to load leave requests." };
  }
  if (policyResult.error) {
    return { ok: false as const, status: 400, error: policyResult.error.message || "Unable to load leave policies." };
  }

  const policies = Array.isArray(policyResult.data) ? policyResult.data : [];
  const balanceCache = new Map<string, number>();

  async function getAvailableBalance(employeeId: string, leavePolicyCode: string) {
    const cacheKey = `${employeeId}:${leavePolicyCode}:${year}`;
    if (balanceCache.has(cacheKey)) return balanceCache.get(cacheKey) || 0;

    const policy = policies.find((row: { code?: string | null }) => String(row.code || "") === leavePolicyCode);
    if (!policy) {
      balanceCache.set(cacheKey, 0);
      return 0;
    }

    const [usageResult, overrideResult] = await Promise.all([
      fetchLeaveUsageForYear({
        admin: params.admin,
        companyId: params.companyId,
        employeeId,
        leavePolicyCode,
        year,
      }),
      fetchLeaveOverrideDays({
        admin: params.admin,
        companyId: params.companyId,
        employeeId,
        leavePolicyCode,
        year,
      }),
    ]);

    if (usageResult.error || overrideResult.error) {
      balanceCache.set(cacheKey, 0);
      return 0;
    }

    const entitlement = computeLeaveEntitlement({
      annualQuota: Number(policy.annual_quota || 0),
      carryForward: Number(policy.carry_forward || 0),
      accrualMode: normalizeAccrualMode(policy.accrual_mode),
      overrideDays: overrideResult.overrideDays,
      asOfIsoDate: todayISOInIndia(),
    });
    const available = Math.max(roundLeaveDays(entitlement.accruedTotal - usageResult.approvedUsed - usageResult.pendingUsed), 0);
    balanceCache.set(cacheKey, available);
    return available;
  }

  const requestRows = Array.isArray(requestResult.data) ? requestResult.data : [];
  const rows: LeaveReportRow[] = [];

  for (const row of requestRows as Array<Record<string, unknown>>) {
    const employees = (row.employees || {}) as Record<string, unknown>;
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
      status: row.status === "approved" || row.status === "rejected" ? row.status : "pending",
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
      pending: filteredRows.filter((row) => row.status === "pending").length,
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
