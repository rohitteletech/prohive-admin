import { addYearsToIsoDate, todayISOInIndia } from "@/lib/dateTime";

export type LeavePolicyYesNo = "Yes" | "No";
export type LeavePolicyStoredStatus = "draft" | "active" | "archived";
export type LeavePolicyBridgeStatus = "Draft" | "Active" | "Archived";
export type LeaveCycleType = "Calendar Year" | "Financial Year";
export type LeavePolicyApprovalFlow = "manager" | "manager_hr" | "hr";
export type LeavePunchOnApprovedLeaveAction = "Allow Punch and Send for Approval" | "Keep Leave" | "Block Punch";
export type LeavePaymentMode = "Paid" | "Unpaid";
export type LeaveAccrualRule = "Yearly Upfront" | "Monthly Accrual";

export const DEFAULT_LEAVE_POLICY_NAME = "Standard Leave Policy";
export const DEFAULT_LEAVE_POLICY_CODE = "LEV-001";

export type LeaveTypeStoredConfig = {
  id: string;
  name: string;
  code: string;
  paymentMode: LeavePaymentMode;
  annualQuota: string;
  halfDayAllowed: LeavePolicyYesNo;
  accrualRule: LeaveAccrualRule;
  carryForwardAllowed: LeavePolicyYesNo;
  maximumCarryForwardDays: string;
  carryForwardExpiryDays: string;
};

export type LeavePolicyStoredConfig = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: LeavePolicyStoredStatus;
  defaultCompanyPolicy: LeavePolicyYesNo;
  leaveCycleType: LeaveCycleType;
  approvalFlow: LeavePolicyApprovalFlow;
  noticePeriodDays: string;
  backdatedLeaveAllowed: LeavePolicyYesNo;
  maximumBackdatedLeaveDays: string;
  ifEmployeePunchesOnApprovedLeave: LeavePunchOnApprovedLeaveAction;
  sandwichLeave: "Enabled" | "Disabled";
  leaveTypes: LeaveTypeStoredConfig[];
};

function text(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function wholeNumberString(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return fallback;
  return String(Math.max(0, Math.round(Number(normalized))));
}

function normalizeYesNo(value: unknown, fallback: LeavePolicyYesNo): LeavePolicyYesNo {
  return String(value ?? "").trim() === "Yes" ? "Yes" : String(value ?? "").trim() === "No" ? "No" : fallback;
}

function normalizeStoredStatus(value: unknown, fallback: LeavePolicyStoredStatus): LeavePolicyStoredStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "archived") return "archived";
  if (normalized === "draft") return "draft";
  return fallback;
}

function normalizeLeaveCycleType(value: unknown, fallback: LeaveCycleType): LeaveCycleType {
  return String(value ?? "").trim() === "Financial Year" ? "Financial Year" : fallback;
}

function normalizeApprovalFlow(value: unknown, fallback: LeavePolicyApprovalFlow): LeavePolicyApprovalFlow {
  const normalized = String(value ?? "").trim();
  if (normalized === "manager" || normalized === "manager_hr" || normalized === "hr") return normalized;
  return fallback;
}

export function normalizePunchOnApprovedLeaveAction(
  value: unknown,
  fallback: LeavePunchOnApprovedLeaveAction = "Allow Punch and Send for Approval",
): LeavePunchOnApprovedLeaveAction {
  const textValue = String(value ?? "").trim();
  if (
    textValue === "Allow Punch and Send for Approval" ||
    textValue === "Keep Leave" ||
    textValue === "Block Punch"
  ) {
    return textValue;
  }
  if (textValue === "Yes") return "Keep Leave";
  if (textValue === "No") return "Allow Punch and Send for Approval";
  return fallback;
}

export function createLeavePolicyGovernanceDates(baseDate = todayISOInIndia()) {
  const effectiveFrom = String(baseDate || "").trim() || todayISOInIndia();
  return {
    effectiveFrom,
    nextReviewDate: addYearsToIsoDate(effectiveFrom, 1),
  };
}

export function createDefaultLeaveTypeConfig(seed = 1): LeaveTypeStoredConfig {
  const safeSeed = Math.max(1, Math.round(Number(seed) || 1));
  const suffix = String(safeSeed).padStart(3, "0");
  return {
    id: `leave-type-${suffix}`,
    name: safeSeed === 1 ? "Casual Leave" : `Leave Type ${safeSeed}`,
    code: safeSeed === 1 ? "CL" : `LV-${suffix}`,
    paymentMode: "Paid",
    annualQuota: "12",
    halfDayAllowed: "Yes",
    accrualRule: "Monthly Accrual",
    carryForwardAllowed: "No",
    maximumCarryForwardDays: "0",
    carryForwardExpiryDays: "0",
  };
}

export function createDefaultLeavePolicyConfig(params?: {
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: LeavePolicyStoredStatus;
  defaultCompanyPolicy?: LeavePolicyYesNo;
}): LeavePolicyStoredConfig {
  const governanceDates = createLeavePolicyGovernanceDates(params?.effectiveFrom);
  const effectiveFrom = params?.effectiveFrom || governanceDates.effectiveFrom;
  const nextReviewDate = params?.nextReviewDate || governanceDates.nextReviewDate;

  return {
    policyName: params?.policyName || DEFAULT_LEAVE_POLICY_NAME,
    policyCode: params?.policyCode || DEFAULT_LEAVE_POLICY_CODE,
    effectiveFrom,
    nextReviewDate,
    status: params?.status || "active",
    defaultCompanyPolicy: params?.defaultCompanyPolicy || "Yes",
    leaveCycleType: "Calendar Year",
    approvalFlow: "manager_hr",
    noticePeriodDays: "1",
    backdatedLeaveAllowed: "No",
    maximumBackdatedLeaveDays: "0",
    ifEmployeePunchesOnApprovedLeave: "Allow Punch and Send for Approval",
    sandwichLeave: "Disabled",
    leaveTypes: [createDefaultLeaveTypeConfig(1)],
  };
}

export function normalizeLeaveTypeConfig(
  rawConfig: Record<string, unknown>,
  index: number,
): LeaveTypeStoredConfig {
  const defaults = createDefaultLeaveTypeConfig(index + 1);
  const carryForwardAllowed = normalizeYesNo(rawConfig.carryForwardAllowed, defaults.carryForwardAllowed);

  return {
    id: text(rawConfig.id, defaults.id),
    name: text(rawConfig.name, defaults.name),
    code: text(rawConfig.code, defaults.code).toUpperCase(),
    paymentMode: text(rawConfig.paymentMode, defaults.paymentMode) === "Unpaid" ? "Unpaid" : "Paid",
    annualQuota: wholeNumberString(rawConfig.annualQuota, defaults.annualQuota),
    halfDayAllowed: normalizeYesNo(rawConfig.halfDayAllowed, defaults.halfDayAllowed),
    accrualRule: text(rawConfig.accrualRule, defaults.accrualRule) === "Monthly Accrual" ? "Monthly Accrual" : "Yearly Upfront",
    carryForwardAllowed,
    maximumCarryForwardDays: carryForwardAllowed === "Yes"
      ? wholeNumberString(rawConfig.maximumCarryForwardDays, defaults.maximumCarryForwardDays)
      : "0",
    carryForwardExpiryDays: carryForwardAllowed === "Yes"
      ? wholeNumberString(rawConfig.carryForwardExpiryDays, defaults.carryForwardExpiryDays)
      : "0",
  };
}

export function normalizeLeavePolicyConfig(
  rawConfig?: Record<string, unknown> | null,
  overrides?: {
    policyName?: string;
    policyCode?: string;
    effectiveFrom?: string;
    nextReviewDate?: string;
    status?: LeavePolicyStoredStatus;
    defaultCompanyPolicy?: LeavePolicyYesNo;
  },
): LeavePolicyStoredConfig {
  const defaults = createDefaultLeavePolicyConfig(overrides);
  const config = (rawConfig || {}) as Record<string, unknown>;
  const backdatedLeaveAllowed = normalizeYesNo(config.backdatedLeaveAllowed, defaults.backdatedLeaveAllowed);
  const leaveTypes = Array.isArray(config.leaveTypes)
    ? config.leaveTypes
        .map((row, index) => normalizeLeaveTypeConfig((row || {}) as Record<string, unknown>, index))
        .filter((row) => Boolean(row.code))
    : defaults.leaveTypes;

  return {
    policyName: text(config.policyName, defaults.policyName),
    policyCode: text(config.policyCode, defaults.policyCode),
    effectiveFrom: text(config.effectiveFrom, defaults.effectiveFrom),
    nextReviewDate: text(config.nextReviewDate, defaults.nextReviewDate),
    status: normalizeStoredStatus(config.status, defaults.status),
    defaultCompanyPolicy: normalizeYesNo(config.defaultCompanyPolicy, defaults.defaultCompanyPolicy),
    leaveCycleType: normalizeLeaveCycleType(config.leaveCycleType, defaults.leaveCycleType),
    approvalFlow: normalizeApprovalFlow(config.approvalFlow, defaults.approvalFlow),
    noticePeriodDays: wholeNumberString(config.noticePeriodDays, defaults.noticePeriodDays),
    backdatedLeaveAllowed,
    maximumBackdatedLeaveDays: backdatedLeaveAllowed === "Yes"
      ? wholeNumberString(config.maximumBackdatedLeaveDays, defaults.maximumBackdatedLeaveDays)
      : "0",
    ifEmployeePunchesOnApprovedLeave: normalizePunchOnApprovedLeaveAction(
      config.ifEmployeePunchesOnApprovedLeave ?? config.leaveOverridesAttendance,
      defaults.ifEmployeePunchesOnApprovedLeave,
    ),
    sandwichLeave: text(config.sandwichLeave, defaults.sandwichLeave) === "Enabled" ? "Enabled" : "Disabled",
    leaveTypes: leaveTypes.length > 0 ? leaveTypes : defaults.leaveTypes,
  };
}

export function leavePolicyBridgeStatusFromStoredStatus(status: LeavePolicyStoredStatus): LeavePolicyBridgeStatus {
  if (status === "active") return "Active";
  if (status === "archived") return "Archived";
  return "Draft";
}
