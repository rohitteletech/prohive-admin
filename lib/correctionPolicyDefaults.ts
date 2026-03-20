import { addYearsToIsoDate, todayISOInIndia } from "@/lib/dateTime";

export type CorrectionPolicyYesNo = "Yes" | "No";
export type CorrectionPolicyApprovalFlow = "Manager Approval" | "HR Approval" | "Manager + HR Approval";
export type CorrectionPolicyStoredStatus = "draft" | "active" | "archived";
export type CorrectionPolicyBridgeStatus = "Draft" | "Active" | "Archived";

export const DEFAULT_CORRECTION_POLICY_NAME = "Standard Correction Policy";
export const DEFAULT_CORRECTION_POLICY_CODE = "COR-001";

export const CORRECTION_POLICY_LIMITS = {
  correctionRequestWindow: { min: 0, max: 31 },
  maximumBackdatedDays: { min: 0, max: 31 },
  maximumRequestsPerMonth: { min: 0, max: 31 },
} as const;

export const DEFAULT_CORRECTION_POLICY_BEHAVIOR = {
  attendanceCorrectionEnabled: "Yes",
  missingPunchCorrectionAllowed: "Yes",
  latePunchRegularizationAllowed: "Yes",
  earlyGoRegularizationAllowed: "Yes",
  correctionRequestWindow: "2",
  backdatedCorrectionAllowed: "No",
  maximumBackdatedDays: "0",
  approvalRequired: "Yes",
  approvalFlow: "Manager + HR Approval",
  maximumRequestsPerMonth: "3",
  reasonMandatory: "Yes",
} as const satisfies {
  attendanceCorrectionEnabled: CorrectionPolicyYesNo;
  missingPunchCorrectionAllowed: CorrectionPolicyYesNo;
  latePunchRegularizationAllowed: CorrectionPolicyYesNo;
  earlyGoRegularizationAllowed: CorrectionPolicyYesNo;
  correctionRequestWindow: string;
  backdatedCorrectionAllowed: CorrectionPolicyYesNo;
  maximumBackdatedDays: string;
  approvalRequired: CorrectionPolicyYesNo;
  approvalFlow: CorrectionPolicyApprovalFlow;
  maximumRequestsPerMonth: string;
  reasonMandatory: CorrectionPolicyYesNo;
};

export type CorrectionPolicyStoredConfig = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: CorrectionPolicyStoredStatus;
  defaultCompanyPolicy: CorrectionPolicyYesNo;
  attendanceCorrectionEnabled: CorrectionPolicyYesNo;
  missingPunchCorrectionAllowed: CorrectionPolicyYesNo;
  latePunchRegularizationAllowed: CorrectionPolicyYesNo;
  earlyGoRegularizationAllowed: CorrectionPolicyYesNo;
  correctionRequestWindow: string;
  backdatedCorrectionAllowed: CorrectionPolicyYesNo;
  maximumBackdatedDays: string;
  approvalRequired: CorrectionPolicyYesNo;
  approvalFlow: CorrectionPolicyApprovalFlow;
  maximumRequestsPerMonth: string;
  reasonMandatory: CorrectionPolicyYesNo;
};

export type CorrectionPolicyBridgeState = Omit<CorrectionPolicyStoredConfig, "status"> & {
  status: CorrectionPolicyBridgeStatus;
};

function text(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeYesNo(value: unknown, fallback: CorrectionPolicyYesNo): CorrectionPolicyYesNo {
  const normalized = String(value ?? "").trim();
  if (normalized === "Yes" || normalized === "No") return normalized;
  return fallback;
}

function normalizeApprovalFlow(value: unknown, fallback: CorrectionPolicyApprovalFlow): CorrectionPolicyApprovalFlow {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "Manager Approval" ||
    normalized === "HR Approval" ||
    normalized === "Manager + HR Approval"
  ) {
    return normalized;
  }
  return fallback;
}

function normalizeStoredStatus(value: unknown, fallback: CorrectionPolicyStoredStatus): CorrectionPolicyStoredStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "archived") return "archived";
  if (normalized === "draft") return "draft";
  return fallback;
}

function clampWholeNumberString(value: unknown, fallback: string, min: number, max: number) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return fallback;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) return fallback;
  return String(Math.min(max, Math.max(min, parsed)));
}

export function createCorrectionPolicyGovernanceDates(baseDate = todayISOInIndia()) {
  const effectiveFrom = String(baseDate || "").trim() || todayISOInIndia();
  return {
    effectiveFrom,
    nextReviewDate: addYearsToIsoDate(effectiveFrom, 1),
  };
}

export function createDefaultCorrectionPolicyConfig(params?: {
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: CorrectionPolicyStoredStatus;
  defaultCompanyPolicy?: CorrectionPolicyYesNo;
}) {
  const governanceDates = createCorrectionPolicyGovernanceDates(params?.effectiveFrom);
  const effectiveFrom = params?.effectiveFrom || governanceDates.effectiveFrom;
  const nextReviewDate = params?.nextReviewDate || governanceDates.nextReviewDate;

  return {
    policyName: params?.policyName || DEFAULT_CORRECTION_POLICY_NAME,
    policyCode: params?.policyCode || DEFAULT_CORRECTION_POLICY_CODE,
    effectiveFrom,
    nextReviewDate,
    status: params?.status || "active",
    defaultCompanyPolicy: params?.defaultCompanyPolicy || "Yes",
    ...DEFAULT_CORRECTION_POLICY_BEHAVIOR,
  } satisfies CorrectionPolicyStoredConfig;
}

export function normalizeCorrectionPolicyConfig(
  rawConfig?: Record<string, unknown> | null,
  overrides?: {
    policyName?: string;
    policyCode?: string;
    effectiveFrom?: string;
    nextReviewDate?: string;
    status?: CorrectionPolicyStoredStatus;
    defaultCompanyPolicy?: CorrectionPolicyYesNo;
  },
) {
  const defaults = createDefaultCorrectionPolicyConfig(overrides);
  const config = (rawConfig || {}) as Record<string, unknown>;
  const correctionRequestWindow = clampWholeNumberString(
    config.correctionRequestWindow,
    defaults.correctionRequestWindow,
    CORRECTION_POLICY_LIMITS.correctionRequestWindow.min,
    CORRECTION_POLICY_LIMITS.correctionRequestWindow.max,
  );
  const backdatedCorrectionAllowed =
    String(config.backdatedCorrectionAllowed ?? "").trim() === "Yes" ? "Yes" : defaults.backdatedCorrectionAllowed;
  const maximumBackdatedDaysRaw = clampWholeNumberString(
    config.maximumBackdatedDays,
    defaults.maximumBackdatedDays,
    CORRECTION_POLICY_LIMITS.maximumBackdatedDays.min,
    CORRECTION_POLICY_LIMITS.maximumBackdatedDays.max,
  );
  const maximumBackdatedDays =
    backdatedCorrectionAllowed === "Yes"
      ? String(Math.min(Number(correctionRequestWindow), Number(maximumBackdatedDaysRaw)))
      : "0";

  return {
    policyName: text(config.policyName, defaults.policyName),
    policyCode: text(config.policyCode, defaults.policyCode),
    effectiveFrom: text(config.effectiveFrom, defaults.effectiveFrom),
    nextReviewDate: text(config.nextReviewDate, defaults.nextReviewDate),
    status: normalizeStoredStatus(config.status, defaults.status),
    defaultCompanyPolicy: normalizeYesNo(config.defaultCompanyPolicy, defaults.defaultCompanyPolicy),
    attendanceCorrectionEnabled: normalizeYesNo(config.attendanceCorrectionEnabled, defaults.attendanceCorrectionEnabled),
    missingPunchCorrectionAllowed: normalizeYesNo(
      config.missingPunchCorrectionAllowed,
      defaults.missingPunchCorrectionAllowed,
    ),
    latePunchRegularizationAllowed: normalizeYesNo(
      config.latePunchRegularizationAllowed,
      defaults.latePunchRegularizationAllowed,
    ),
    earlyGoRegularizationAllowed: normalizeYesNo(
      config.earlyGoRegularizationAllowed,
      defaults.earlyGoRegularizationAllowed,
    ),
    correctionRequestWindow,
    backdatedCorrectionAllowed,
    maximumBackdatedDays,
    approvalRequired: normalizeYesNo(config.approvalRequired, defaults.approvalRequired),
    approvalFlow: normalizeApprovalFlow(config.approvalFlow, defaults.approvalFlow),
    maximumRequestsPerMonth: clampWholeNumberString(
      config.maximumRequestsPerMonth,
      defaults.maximumRequestsPerMonth,
      CORRECTION_POLICY_LIMITS.maximumRequestsPerMonth.min,
      CORRECTION_POLICY_LIMITS.maximumRequestsPerMonth.max,
    ),
    reasonMandatory: normalizeYesNo(config.reasonMandatory, defaults.reasonMandatory),
  } satisfies CorrectionPolicyStoredConfig;
}

export function correctionPolicyBridgeStatusFromStoredStatus(status: CorrectionPolicyStoredStatus): CorrectionPolicyBridgeStatus {
  if (status === "active") return "Active";
  if (status === "archived") return "Archived";
  return "Draft";
}

export function correctionPolicyBridgeStateFromStoredConfig(config: CorrectionPolicyStoredConfig): CorrectionPolicyBridgeState {
  return {
    ...config,
    status: correctionPolicyBridgeStatusFromStoredStatus(config.status),
  };
}
