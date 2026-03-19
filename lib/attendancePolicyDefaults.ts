import { addYearsToIsoDate, todayISOInIndia } from "@/lib/dateTime";

export const DEFAULT_ATTENDANCE_POLICY_NAME = "Standard Attendance Policy";
export const DEFAULT_ATTENDANCE_POLICY_CODE = "ATT-001";

export const DEFAULT_ATTENDANCE_POLICY_BEHAVIOR = {
  presentTrigger: "punch_in_out",
  singlePunchHandling: "absent",
  extraHoursCountingRule: "count",
  latePunchRule: "enforce_penalty",
  earlyGoRule: "flag_only",
  presentDaysFormula: "full_plus_half",
  halfDayValue: "0.5",
  latePunchPenaltyEnabled: "Yes",
  latePunchUpToMinutes: "60",
  repeatLateDaysInMonth: "3",
  penaltyForRepeatLate: "0.5",
  latePunchAboveMinutes: "60",
  penaltyForLateAboveLimit: "0.5",
  earlyGoUpToMinutes: "30",
  repeatEarlyGoDaysInMonth: "3",
  penaltyForRepeatEarlyGo: "0.5",
  earlyGoAboveMinutes: "30",
  penaltyForEarlyGoAboveLimit: "0.5",
} as const;

export function createAttendancePolicyGovernanceDates(baseDate = todayISOInIndia()) {
  const effectiveFrom = String(baseDate || "").trim() || todayISOInIndia();
  return {
    effectiveFrom,
    nextReviewDate: addYearsToIsoDate(effectiveFrom, 1),
  };
}

export function createDefaultAttendancePolicyConfig(params?: {
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "draft" | "active" | "archived";
  defaultCompanyPolicy?: "Yes" | "No";
}) {
  const governanceDates = createAttendancePolicyGovernanceDates(params?.effectiveFrom);
  const effectiveFrom = params?.effectiveFrom || governanceDates.effectiveFrom;
  const nextReviewDate = params?.nextReviewDate || governanceDates.nextReviewDate;

  return {
    policyName: params?.policyName || DEFAULT_ATTENDANCE_POLICY_NAME,
    policyCode: params?.policyCode || DEFAULT_ATTENDANCE_POLICY_CODE,
    effectiveFrom,
    nextReviewDate,
    status: params?.status || "active",
    defaultCompanyPolicy: params?.defaultCompanyPolicy || "Yes",
    ...DEFAULT_ATTENDANCE_POLICY_BEHAVIOR,
  };
}
