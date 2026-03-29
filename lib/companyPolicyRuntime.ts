import { PolicyDefinition } from "@/lib/companyPolicies";
import type { AttendanceStatusPenaltyRuntime } from "@/lib/attendancePolicy";
import { DEFAULT_ATTENDANCE_POLICY_BEHAVIOR } from "@/lib/attendancePolicyDefaults";
import { normalizeCorrectionPolicyConfig } from "@/lib/correctionPolicyDefaults";
import { normalizeHolidayPolicyConfig, weeklyOffRuntimePolicyFromPattern } from "@/lib/holidayPolicyDefaults";
import { normalizeLeavePolicyConfig, type LeaveTypeStoredConfig } from "@/lib/leavePolicyDefaults";
import { normalizeExtraHoursPolicy, normalizeHalfDayMinWorkMins, normalizePunchAccessRule } from "@/lib/shiftWorkPolicy";

function text(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function wholeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function decimalNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function yesNo(value: unknown, fallback: "Yes" | "No" = "No") {
  const normalized = String(value ?? "").trim();
  if (normalized === "Yes" || normalized === "No") return normalized;
  return fallback;
}

function clockToMinutes(value: unknown, fallback: number) {
  const [hours, minutes] = String(value || "").trim().split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return Math.max(0, hours * 60 + minutes);
}

function shiftPunchAccessRule(config: Record<string, unknown>, fallback?: {
  punchAccessRule?: string;
  loginAccessRule?: string;
}) {
  return normalizePunchAccessRule(
    config.punchAccessRule || config.loginAccessRule || fallback?.punchAccessRule || fallback?.loginAccessRule,
  );
}

function shiftEarlyPunchAllowed(config: Record<string, unknown>, fallback?: {
  earlyPunchAllowed?: number;
  earlyInAllowed?: number;
}) {
  return wholeNumber(
    config.earlyPunchAllowed || config.earlyInAllowed,
    fallback?.earlyPunchAllowed ?? fallback?.earlyInAllowed ?? 15,
  );
}

export function resolveShiftPolicyRuntime(policy: PolicyDefinition | null, fallback?: {
  shiftName?: string;
  shiftType?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  halfDayAvailable?: string;
  halfDayHours?: string;
  halfDayMinWorkMins?: number;
  punchAccessRule?: string;
  earlyPunchAllowed?: number;
  loginAccessRule?: string;
  earlyInAllowed?: number;
  gracePeriod?: number;
  minimumWorkBeforePunchOut?: number;
}) {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  const halfDayHours = text(
    config.halfDayHours,
    fallback?.halfDayHours ||
      (typeof fallback?.halfDayMinWorkMins === "number"
        ? `${String(Math.floor(fallback.halfDayMinWorkMins / 60)).padStart(2, "0")}:${String(fallback.halfDayMinWorkMins % 60).padStart(2, "0")}`
        : "04:00")
  );
  return {
    shiftName: text(config.shiftName, fallback?.shiftName || "General Shift"),
    shiftType: text(config.shiftType, fallback?.shiftType || "General"),
    shiftStartTime: text(config.shiftStartTime, fallback?.shiftStartTime || "09:00"),
    shiftEndTime: text(config.shiftEndTime, fallback?.shiftEndTime || "18:00"),
    halfDayAvailable: yesNo(config.halfDayAvailable, fallback?.halfDayAvailable === "No" ? "No" : "Yes"),
    halfDayHours,
    halfDayMinWorkMins: normalizeHalfDayMinWorkMins(
      clockToMinutes(config.halfDayHours, clockToMinutes(halfDayHours, fallback?.halfDayMinWorkMins ?? 240)),
      fallback?.halfDayMinWorkMins ?? 240,
    ),
    punchAccessRule: shiftPunchAccessRule(config, fallback),
    earlyPunchAllowed: shiftEarlyPunchAllowed(config, fallback),
    // Deprecated aliases kept temporarily so older call sites remain safe during cleanup.
    loginAccessRule: shiftPunchAccessRule(config, fallback),
    earlyInAllowed: shiftEarlyPunchAllowed(config, fallback),
    gracePeriod: wholeNumber(config.gracePeriod, fallback?.gracePeriod ?? 10),
    minimumWorkBeforePunchOut: wholeNumber(
      config.minimumWorkBeforePunchOut,
      fallback?.minimumWorkBeforePunchOut ?? 60,
    ),
  };
}

export function resolveAttendancePolicyRuntime(policy: PolicyDefinition | null, fallback?: {
  extraHoursCountingRule?: string;
}): AttendanceStatusPenaltyRuntime & {
  extraHoursPolicy: string;
} {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  const latePunchRule =
    text(config.latePunchRule, DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.latePunchRule) === "enforce_penalty"
      ? "enforce_penalty"
      : "flag_only";
  const earlyGoRule =
    text(config.earlyGoRule, DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.earlyGoRule) === "enforce_penalty"
      ? "enforce_penalty"
      : "flag_only";
  return {
    extraHoursPolicy: normalizeExtraHoursPolicy(
      config.extraHoursCountingRule === "ignore"
        ? "no"
        : config.extraHoursCountingRule === "count"
          ? "yes"
          : fallback?.extraHoursCountingRule === "ignore"
            ? "no"
            : fallback?.extraHoursCountingRule === "count"
              ? "yes"
              : "yes",
    ),
    presentTrigger: text(config.presentTrigger, DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.presentTrigger),
    singlePunchHandling:
      text(config.singlePunchHandling, DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.singlePunchHandling) === "present" ? "present" : "absent",
    presentDaysFormula:
      text(config.presentDaysFormula, DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.presentDaysFormula) === "full_only"
        ? "full_only"
        : "full_plus_half",
    latePunchRule,
    earlyGoRule,
    halfDayValue: text(config.halfDayValue, DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.halfDayValue) === "1.0" ? 1 : 0.5,
    latePunchUpToMinutes: wholeNumber(config.latePunchUpToMinutes, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.latePunchUpToMinutes)),
    repeatLateDaysInMonth: wholeNumber(config.repeatLateDaysInMonth, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.repeatLateDaysInMonth)),
    dayCountForRepeatLate: decimalNumber(config.penaltyForRepeatLate, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.penaltyForRepeatLate)),
    latePunchAboveMinutes: wholeNumber(config.latePunchAboveMinutes, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.latePunchAboveMinutes)),
    dayCountForLateAboveLimit:
      decimalNumber(config.penaltyForLateAboveLimit, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.penaltyForLateAboveLimit)),
    earlyGoUpToMinutes: wholeNumber(config.earlyGoUpToMinutes, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.earlyGoUpToMinutes)),
    repeatEarlyGoDaysInMonth:
      wholeNumber(config.repeatEarlyGoDaysInMonth, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.repeatEarlyGoDaysInMonth)),
    dayCountForRepeatEarlyGo:
      decimalNumber(config.penaltyForRepeatEarlyGo, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.penaltyForRepeatEarlyGo)),
    earlyGoAboveMinutes: wholeNumber(config.earlyGoAboveMinutes, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.earlyGoAboveMinutes)),
    dayCountForEarlyGoAboveLimit:
      decimalNumber(config.penaltyForEarlyGoAboveLimit, Number(DEFAULT_ATTENDANCE_POLICY_BEHAVIOR.penaltyForEarlyGoAboveLimit)),
  };
}

export function resolveHolidayPolicyRuntime(policy: PolicyDefinition | null) {
  const config = normalizeHolidayPolicyConfig((policy?.configJson || {}) as Record<string, unknown>, {
    policyName: String(policy?.policyName || ""),
    policyCode: String(policy?.policyCode || ""),
    effectiveFrom: String(policy?.effectiveFrom || ""),
    nextReviewDate: String(policy?.nextReviewDate || ""),
    status:
      policy?.status === "active"
        ? "active"
        : policy?.status === "archived"
          ? "archived"
          : "draft",
    defaultCompanyPolicy: policy?.isDefault === false ? "No" : "Yes",
  });

  return {
    weeklyOffPolicy: weeklyOffRuntimePolicyFromPattern(config.weeklyOffPattern),
    allowPunchOnHoliday: config.holidayPunchAllowed === "Yes",
    allowPunchOnWeeklyOff: config.weeklyOffPunchAllowed === "Yes",
    holidayWorkedStatus: config.holidayWorkedStatus,
    weeklyOffWorkedStatus: config.weeklyOffWorkedStatus,
    compOffValidityDays: wholeNumber(config.compOffValidityDays, 0),
  };
}

export type ResolvedLeaveTypeRuntime = {
  id: string;
  name: string;
  code: string;
  paymentMode: "Paid" | "Unpaid";
  annualQuota: number;
  halfDayAllowed: boolean;
  accrualRule: "Yearly Upfront" | "Monthly Accrual";
  carryForwardAllowed: boolean;
  maximumCarryForwardDays: number;
  carryForwardExpiryDays: number;
};

export type ResolvedLeavePolicyRowRuntime = {
  id: string;
  name: string;
  code: string;
  halfDayAllowed: boolean;
  annual_quota: number;
  carry_forward: number;
  accrual_mode: "upfront" | "monthly";
  encashable: boolean;
  active: boolean;
};

export function resolveLeaveTypesRuntime(policy: PolicyDefinition | null) {
  const config = normalizeLeavePolicyConfig((policy?.configJson || {}) as Record<string, unknown>, {
    policyName: String(policy?.policyName || ""),
    policyCode: String(policy?.policyCode || ""),
    effectiveFrom: String(policy?.effectiveFrom || ""),
    nextReviewDate: String(policy?.nextReviewDate || ""),
    status:
      policy?.status === "active"
        ? "active"
        : policy?.status === "archived"
          ? "archived"
          : "draft",
    defaultCompanyPolicy: policy?.isDefault === false ? "No" : "Yes",
  });
  const rows = Array.isArray(config.leaveTypes) ? config.leaveTypes : [];
  return rows
    .map((row, index) => {
      const source = (row || {}) as LeaveTypeStoredConfig;
      const code = text(source.code).toUpperCase();
      if (!code) return null;
      return {
        id: text(source.id, `leave-type-${index + 1}`),
        name: text(source.name, `Leave Type ${index + 1}`),
        code,
        paymentMode: text(source.paymentMode, "Paid") === "Unpaid" ? "Unpaid" : "Paid",
        annualQuota: wholeNumber(source.annualQuota, 0),
        halfDayAllowed: yesNo(source.halfDayAllowed, "Yes") === "Yes",
        accrualRule:
          text(source.accrualRule) === "Monthly Accrual"
            ? "Monthly Accrual"
            : "Yearly Upfront",
        carryForwardAllowed: yesNo(source.carryForwardAllowed, "No") === "Yes",
        maximumCarryForwardDays: wholeNumber(source.maximumCarryForwardDays, 0),
        carryForwardExpiryDays: wholeNumber(source.carryForwardExpiryDays, 0),
      } satisfies ResolvedLeaveTypeRuntime;
    })
    .filter((row): row is ResolvedLeaveTypeRuntime => Boolean(row));
}

export function resolveLeavePolicyRowsRuntime(policy: PolicyDefinition | null): ResolvedLeavePolicyRowRuntime[] {
  return resolveLeaveTypesRuntime(policy).map((leaveType) => ({
    id: leaveType.id,
    name: leaveType.name,
    code: leaveType.code,
    halfDayAllowed: leaveType.halfDayAllowed,
    annual_quota: leaveType.annualQuota,
    carry_forward: leaveType.carryForwardAllowed ? Math.max(0, Math.round(Number(leaveType.maximumCarryForwardDays || 0))) : 0,
    accrual_mode: leaveType.accrualRule === "Yearly Upfront" ? "upfront" : "monthly",
    encashable: false,
    active: true,
  }));
}

export function resolveLeavePolicyRuntime(policy: PolicyDefinition | null) {
  const config = normalizeLeavePolicyConfig((policy?.configJson || {}) as Record<string, unknown>, {
    policyName: String(policy?.policyName || ""),
    policyCode: String(policy?.policyCode || ""),
    effectiveFrom: String(policy?.effectiveFrom || ""),
    nextReviewDate: String(policy?.nextReviewDate || ""),
    status:
      policy?.status === "active"
        ? "active"
        : policy?.status === "archived"
          ? "archived"
          : "draft",
    defaultCompanyPolicy: policy?.isDefault === false ? "No" : "Yes",
  });
  return {
    leaveCycleType: config.leaveCycleType,
    approvalFlow: config.approvalFlow,
    noticePeriodDays: wholeNumber(config.noticePeriodDays, 1),
    backdatedLeaveAllowed: config.backdatedLeaveAllowed === "Yes",
    maximumBackdatedLeaveDays: wholeNumber(config.maximumBackdatedLeaveDays, 0),
    ifEmployeePunchesOnApprovedLeave:
      config.ifEmployeePunchesOnApprovedLeave,
  } as const;
}

export function resolveCorrectionPolicyRuntime(policy: PolicyDefinition | null) {
  const config = normalizeCorrectionPolicyConfig((policy?.configJson || {}) as Record<string, unknown>, {
    policyName: String(policy?.policyName || ""),
    policyCode: String(policy?.policyCode || ""),
    effectiveFrom: String(policy?.effectiveFrom || ""),
    nextReviewDate: String(policy?.nextReviewDate || ""),
    status:
      policy?.status === "active"
        ? "active"
        : policy?.status === "archived"
          ? "archived"
          : "draft",
    defaultCompanyPolicy: policy?.isDefault === false ? "No" : "Yes",
  });
  return {
    attendanceCorrectionEnabled: config.attendanceCorrectionEnabled === "Yes",
    missingPunchCorrectionAllowed: config.missingPunchCorrectionAllowed === "Yes",
    latePunchRegularizationAllowed: config.latePunchRegularizationAllowed === "Yes",
    earlyGoRegularizationAllowed: config.earlyGoRegularizationAllowed === "Yes",
    maximumBackdatedDays: wholeNumber(config.maximumBackdatedDays, 0),
    approvalRequired: config.approvalRequired === "Yes",
    approvalFlow: config.approvalFlow,
    maximumRequestsPerMonth: wholeNumber(config.maximumRequestsPerMonth, 3),
    reasonMandatory: config.reasonMandatory === "Yes",
  };
}
