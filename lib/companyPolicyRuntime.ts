import { PolicyDefinition } from "@/lib/companyPolicies";
import type { AttendanceStatusPenaltyRuntime } from "@/lib/attendancePolicy";
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
  return String(value || "").trim() === "Yes" ? "Yes" : fallback;
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
  const latePunchRule = text(config.latePunchRule, "flag_only") === "enforce_penalty" ? "enforce_penalty" : "flag_only";
  const earlyGoRule = text(config.earlyGoRule, "flag_only") === "enforce_penalty" ? "enforce_penalty" : "flag_only";
  return {
    extraHoursPolicy: normalizeExtraHoursPolicy(
      config.extraHoursCountingRule === "ignore"
        ? "no"
        : config.extraHoursCountingRule === "count"
          ? "yes"
          : fallback?.extraHoursCountingRule,
    ),
    presentTrigger: text(config.presentTrigger, "punch_in_out"),
    singlePunchHandling: text(config.singlePunchHandling, "incomplete_punch"),
    latePunchRule,
    earlyGoRule,
    halfDayValue: text(config.halfDayValue, "0.5") === "1.0" ? 1 : 0.5,
    latePunchUpToMinutes: wholeNumber(config.latePunchUpToMinutes, 60),
    repeatLateDaysInMonth: wholeNumber(config.repeatLateDaysInMonth, 3),
    dayCountForRepeatLate: decimalNumber(config.penaltyForRepeatLate, 1),
    latePunchAboveMinutes: wholeNumber(config.latePunchAboveMinutes, 60),
    dayCountForLateAboveLimit: decimalNumber(config.penaltyForLateAboveLimit, 0.5),
    earlyGoUpToMinutes: wholeNumber(config.earlyGoUpToMinutes, 30),
    repeatEarlyGoDaysInMonth: wholeNumber(config.repeatEarlyGoDaysInMonth, 3),
    dayCountForRepeatEarlyGo: decimalNumber(config.penaltyForRepeatEarlyGo, 1),
    earlyGoAboveMinutes: wholeNumber(config.earlyGoAboveMinutes, 60),
    dayCountForEarlyGoAboveLimit: decimalNumber(config.penaltyForEarlyGoAboveLimit, 0.5),
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
      : weeklyOffPattern === "Alternate Saturday + Sunday"
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
    ifEmployeePunchesOnApprovedLeave:
      action === "Keep Leave" || action === "Block Punch" || action === "Allow Punch and Send for Approval"
        ? action
        : "Allow Punch and Send for Approval",
  } as const;
}

export function resolveCorrectionPolicyRuntime(policy: PolicyDefinition | null) {
  const config = (policy?.configJson || {}) as Record<string, unknown>;
  return {
    attendanceCorrectionEnabled: yesNo(config.attendanceCorrectionEnabled, "Yes") === "Yes",
    missingPunchCorrectionAllowed: yesNo(config.missingPunchCorrectionAllowed, "Yes") === "Yes",
    latePunchRegularizationAllowed: yesNo(config.latePunchRegularizationAllowed, "Yes") === "Yes",
    earlyGoRegularizationAllowed: yesNo(config.earlyGoRegularizationAllowed, "Yes") === "Yes",
    correctionRequestWindow: wholeNumber(config.correctionRequestWindow, 2),
    backdatedCorrectionAllowed: yesNo(config.backdatedCorrectionAllowed, "No") === "Yes",
    maximumBackdatedDays: wholeNumber(config.maximumBackdatedDays, 2),
    approvalRequired: yesNo(config.approvalRequired, "Yes") === "Yes",
    approvalFlow: text(config.approvalFlow, "Manager + HR Approval"),
    maximumRequestsPerMonth: wholeNumber(config.maximumRequestsPerMonth, 5),
    reasonMandatory: yesNo(config.reasonMandatory, "Yes") === "Yes",
  };
}
