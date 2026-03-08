export type LeaveAccrualMode = "monthly" | "upfront";

export function normalizeAccrualMode(value: unknown): LeaveAccrualMode {
  return value === "upfront" ? "upfront" : "monthly";
}

export function monthsElapsedInYear(isoDate: string) {
  const month = Number(String(isoDate || "").slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return 12;
  return month;
}

export function accruedAnnualQuota(annualQuota: number, accrualMode: LeaveAccrualMode, asOfIsoDate: string) {
  const quota = Number.isFinite(annualQuota) ? Math.max(Number(annualQuota), 0) : 0;
  if (accrualMode === "upfront") return quota;
  const elapsed = monthsElapsedInYear(asOfIsoDate);
  return Math.floor((quota * elapsed) / 12);
}

export function roundLeaveDays(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function computeLeaveEntitlement(params: {
  annualQuota: number;
  carryForward: number;
  accrualMode: LeaveAccrualMode;
  overrideDays: number;
  asOfIsoDate: string;
}) {
  const annualAccrued = accruedAnnualQuota(params.annualQuota, params.accrualMode, params.asOfIsoDate);
  const carryForward = Number.isFinite(params.carryForward) ? Math.max(Number(params.carryForward), 0) : 0;
  const overrideDays = Number.isFinite(params.overrideDays) ? Number(params.overrideDays) : 0;
  const accruedTotal = roundLeaveDays(annualAccrued + carryForward + overrideDays);
  return {
    annualAccrued: roundLeaveDays(annualAccrued),
    carryForward: roundLeaveDays(carryForward),
    overrideDays: roundLeaveDays(overrideDays),
    accruedTotal,
  };
}

export async function fetchLeaveUsageForYear(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  leavePolicyCode: string;
  year: number;
}) {
  const yearStart = `${params.year}-01-01`;
  const yearEnd = `${params.year}-12-31`;
  const { data, error } = await params.admin
    .from("employee_leave_requests")
    .select("days,paid_days,status")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("leave_policy_code", params.leavePolicyCode)
    .gte("from_date", yearStart)
    .lte("from_date", yearEnd);
  if (error) return { approvedUsed: 0, pendingUsed: 0, error: error.message || "Unable to load leave usage." };

  let approvedUsed = 0;
  let pendingUsed = 0;
  (data || []).forEach((row: { days: number; paid_days?: number | null; status: "pending" | "approved" | "rejected" }) => {
    const consumed = Number((row.paid_days ?? row.days) || 0);
    if (row.status === "approved") approvedUsed += consumed;
    if (row.status === "pending") pendingUsed += consumed;
  });
  return { approvedUsed: roundLeaveDays(approvedUsed), pendingUsed: roundLeaveDays(pendingUsed), error: null as string | null };
}

export async function fetchLeaveOverrideDays(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  leavePolicyCode: string;
  year: number;
}) {
  const { data, error } = await params.admin
    .from("employee_leave_balance_overrides")
    .select("extra_days")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("leave_policy_code", params.leavePolicyCode)
    .eq("year", params.year)
    .maybeSingle();
  if (error) return { overrideDays: 0, error: error.message || "Unable to load leave overrides." };
  return { overrideDays: roundLeaveDays(Number(data?.extra_days || 0)), error: null as string | null };
}
