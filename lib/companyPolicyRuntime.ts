import { PolicyDefinition } from "@/lib/companyPolicies";
import type { AttendanceStatusPenaltyRuntime } from "@/lib/attendancePolicy";
import { DEFAULT_ATTENDANCE_POLICY_BEHAVIOR } from "@/lib/attendancePolicyDefaults";
import { normalizeCorrectionPolicyConfig } from "@/lib/correctionPolicyDefaults";
import { normalizeExtraHoursPolicy, normalizeHalfDayMinWorkMins, normalizeLoginAccessRule } from "@/lib/shiftWorkPolicy";
import { normalizeWeeklyOffPolicy } from "@/lib/weeklyOff";

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

export function resolveShiftPolicyRuntime(policy: PolicyDefinition | null, fallback?: {
  shiftName?: string;
  shiftType?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  halfDayAvailable?: string;
  halfDayHours?: string;
  halfDayMinWorkMins?: number;
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
    loginAccessRule: normalizeLoginAccessRule(config.loginAccessRule || fallback?.loginAccessRule),
    earlyInAllowed: wholeNumber(config.earlyInAllowed, fallback?.earlyInAllowed ?? 15),
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

export function resolveHolidayPolicyRuntime(policy: PolicyDefinition | null, fallback?: {
  weeklyOffPolicy?: unknown;
  allowPunchOnHoliday?: boolean;
  allowPunchOnWeeklyOff?: boolean;
}) {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  const weeklyOffPattern = text(config.weeklyOffPattern);
  const weeklyOffPolicy =
    weeklyOffPattern === "Saturday + Sunday"
      ? "saturday_sunday"
      : weeklyOffPattern === "2nd and 4th Saturday + Sunday" || weeklyOffPattern === "Alternate Saturday + Sunday"
        ? "second_fourth_saturday_sunday"
        : weeklyOffPattern === "Custom"
          ? normalizeWeeklyOffPolicy(text(config.customWeeklyOffPattern))
          : normalizeWeeklyOffPolicy(fallback?.weeklyOffPolicy);

  return {
    weeklyOffPolicy,
    allowPunchOnHoliday:
      yesNo(config.holidayPunchAllowed, fallback?.allowPunchOnHoliday === false ? "No" : "Yes") === "Yes",
    allowPunchOnWeeklyOff:
      yesNo(config.weeklyOffPunchAllowed, fallback?.allowPunchOnWeeklyOff === false ? "No" : "Yes") === "Yes",
    holidayWorkedStatus:
      text(config.holidayWorkedStatus) === "Record Only" ||
      text(config.holidayWorkedStatus) === "OT Only" ||
      text(config.holidayWorkedStatus) === "Grant Comp Off" ||
      text(config.holidayWorkedStatus) === "Present + OT" ||
      text(config.holidayWorkedStatus) === "Manual Review"
        ? text(config.holidayWorkedStatus)
        : text(config.holidayWorkedStatus) === "Present"
          ? "Present + OT"
          : "Grant Comp Off",
    weeklyOffWorkedStatus:
      text(config.weeklyOffWorkedStatus) === "Record Only" ||
      text(config.weeklyOffWorkedStatus) === "OT Only" ||
      text(config.weeklyOffWorkedStatus) === "Grant Comp Off" ||
      text(config.weeklyOffWorkedStatus) === "Present + OT" ||
      text(config.weeklyOffWorkedStatus) === "Manual Review"
        ? text(config.weeklyOffWorkedStatus)
        : text(config.weeklyOffWorkedStatus) === "Present"
          ? "Present + OT"
          : "Grant Comp Off",
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

export function resolveLeaveTypesRuntime(policy: PolicyDefinition | null) {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  const rows = Array.isArray(config.leaveTypes) ? config.leaveTypes : [];
  return rows
    .map((row, index) => {
      const source = (row || {}) as Record<string, unknown>;
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

export function resolveLeavePolicyRuntime(policy: PolicyDefinition | null) {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  const action = text(
    config.ifEmployeePunchesOnApprovedLeave,
    text(config.leaveOverridesAttendance) === "Yes" ? "Keep Leave" : "Allow Punch and Send for Approval",
  );
  return {
    leaveCycleType: text(config.leaveCycleType, "Calendar Year") === "Financial Year" ? "Financial Year" : "Calendar Year",
    approvalFlow:
      text(config.approvalFlow) === "manager"
        ? "manager"
        : text(config.approvalFlow) === "hr"
          ? "hr"
          : "manager_hr",
    noticePeriodDays: wholeNumber(config.noticePeriodDays, 1),
    backdatedLeaveAllowed: yesNo(config.backdatedLeaveAllowed, "No") === "Yes",
    ifEmployeePunchesOnApprovedLeave:
      action === "Keep Leave" || action === "Block Punch" || action === "Allow Punch and Send for Approval"
        ? action
        : "Allow Punch and Send for Approval",
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
    correctionRequestWindow: wholeNumber(config.correctionRequestWindow, 2),
    backdatedCorrectionAllowed: config.backdatedCorrectionAllowed === "Yes",
    maximumBackdatedDays: wholeNumber(config.maximumBackdatedDays, 0),
    approvalRequired: config.approvalRequired === "Yes",
    approvalFlow: config.approvalFlow,
    maximumRequestsPerMonth: wholeNumber(config.maximumRequestsPerMonth, 3),
    reasonMandatory: config.reasonMandatory === "Yes",
  };
}
