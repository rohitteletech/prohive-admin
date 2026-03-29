import { addYearsToIsoDate, todayISOInIndia } from "@/lib/dateTime";
import { normalizeWeeklyOffPolicy, type WeeklyOffPolicy } from "@/lib/weeklyOff";

export type HolidayPolicyYesNo = "Yes" | "No";
export type HolidayPolicyStoredStatus = "draft" | "active" | "archived";
export type HolidayPolicyBridgeStatus = "Draft" | "Active" | "Archived";
export type HolidayWorkedDayTreatment = "Record Only" | "OT Only" | "Grant Comp Off" | "Present + OT" | "Manual Review";
export type HolidayWeeklyOffPattern = "Sunday Only" | "Saturday + Sunday" | "2nd and 4th Saturday + Sunday";

export const DEFAULT_HOLIDAY_POLICY_NAME = "Standard Holiday Policy";
export const DEFAULT_HOLIDAY_POLICY_CODE = "HOL-001";

export type HolidayPolicyStoredConfig = {
  policyName: string;
  policyCode: string;
  effectiveFrom: string;
  nextReviewDate: string;
  status: HolidayPolicyStoredStatus;
  defaultCompanyPolicy: HolidayPolicyYesNo;
  holidaySource: "Company";
  weeklyOffPattern: HolidayWeeklyOffPattern;
  holidayPunchAllowed: HolidayPolicyYesNo;
  weeklyOffPunchAllowed: HolidayPolicyYesNo;
  holidayWorkedStatus: HolidayWorkedDayTreatment;
  weeklyOffWorkedStatus: HolidayWorkedDayTreatment;
  compOffValidityDays: string;
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

function normalizeYesNo(value: unknown, fallback: HolidayPolicyYesNo): HolidayPolicyYesNo {
  return String(value ?? "").trim() === "Yes" ? "Yes" : String(value ?? "").trim() === "No" ? "No" : fallback;
}

function normalizeStoredStatus(value: unknown, fallback: HolidayPolicyStoredStatus): HolidayPolicyStoredStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "archived") return "archived";
  if (normalized === "draft") return "draft";
  return fallback;
}

export function normalizeHolidayWorkedDayTreatment(
  value: unknown,
  fallback: HolidayWorkedDayTreatment = "Grant Comp Off",
): HolidayWorkedDayTreatment {
  const normalized = String(value ?? "").trim();
  if (
    normalized === "Record Only" ||
    normalized === "OT Only" ||
    normalized === "Grant Comp Off" ||
    normalized === "Present + OT" ||
    normalized === "Manual Review"
  ) {
    return normalized;
  }
  if (normalized === "Holiday Worked" || normalized === "Weekly Off Worked") return "Grant Comp Off";
  if (normalized === "Present") return "Present + OT";
  return fallback;
}

export function holidayWeeklyOffPatternFromRuntimePolicy(policy: WeeklyOffPolicy): HolidayWeeklyOffPattern {
  if (policy === "saturday_sunday") return "Saturday + Sunday";
  if (policy === "second_fourth_saturday_sunday") return "2nd and 4th Saturday + Sunday";
  return "Sunday Only";
}

export function weeklyOffRuntimePolicyFromPattern(value: unknown): WeeklyOffPolicy {
  const pattern = String(value ?? "").trim();
  if (pattern === "Saturday + Sunday") return "saturday_sunday";
  if (pattern === "2nd and 4th Saturday + Sunday" || pattern === "Alternate Saturday + Sunday") {
    return "second_fourth_saturday_sunday";
  }
  return normalizeWeeklyOffPolicy("sunday_only");
}

export function createHolidayPolicyGovernanceDates(baseDate = todayISOInIndia()) {
  const effectiveFrom = String(baseDate || "").trim() || todayISOInIndia();
  return {
    effectiveFrom,
    nextReviewDate: addYearsToIsoDate(effectiveFrom, 1),
  };
}

export function createDefaultHolidayPolicyConfig(params?: {
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: HolidayPolicyStoredStatus;
  defaultCompanyPolicy?: HolidayPolicyYesNo;
}): HolidayPolicyStoredConfig {
  const governanceDates = createHolidayPolicyGovernanceDates(params?.effectiveFrom);
  const effectiveFrom = params?.effectiveFrom || governanceDates.effectiveFrom;
  const nextReviewDate = params?.nextReviewDate || governanceDates.nextReviewDate;

  return {
    policyName: params?.policyName || DEFAULT_HOLIDAY_POLICY_NAME,
    policyCode: params?.policyCode || DEFAULT_HOLIDAY_POLICY_CODE,
    effectiveFrom,
    nextReviewDate,
    status: params?.status || "active",
    defaultCompanyPolicy: params?.defaultCompanyPolicy || "Yes",
    holidaySource: "Company",
    weeklyOffPattern: "Sunday Only",
    holidayPunchAllowed: "Yes",
    weeklyOffPunchAllowed: "Yes",
    holidayWorkedStatus: "Grant Comp Off",
    weeklyOffWorkedStatus: "Grant Comp Off",
    compOffValidityDays: "60",
  };
}

export function normalizeHolidayPolicyConfig(
  rawConfig?: Record<string, unknown> | null,
  overrides?: {
    policyName?: string;
    policyCode?: string;
    effectiveFrom?: string;
    nextReviewDate?: string;
    status?: HolidayPolicyStoredStatus;
    defaultCompanyPolicy?: HolidayPolicyYesNo;
  },
): HolidayPolicyStoredConfig {
  const defaults = createDefaultHolidayPolicyConfig(overrides);
  const config = (rawConfig || {}) as Record<string, unknown>;
  const holidayPunchAllowed = normalizeYesNo(config.holidayPunchAllowed, defaults.holidayPunchAllowed);
  const weeklyOffPunchAllowed = normalizeYesNo(config.weeklyOffPunchAllowed, defaults.weeklyOffPunchAllowed);
  const holidayWorkedStatus = holidayPunchAllowed === "Yes"
    ? normalizeHolidayWorkedDayTreatment(config.holidayWorkedStatus, defaults.holidayWorkedStatus)
    : "Record Only";
  const weeklyOffWorkedStatus = weeklyOffPunchAllowed === "Yes"
    ? normalizeHolidayWorkedDayTreatment(config.weeklyOffWorkedStatus, defaults.weeklyOffWorkedStatus)
    : "Record Only";
  const compOffApplies =
    (holidayPunchAllowed === "Yes" && holidayWorkedStatus === "Grant Comp Off") ||
    (weeklyOffPunchAllowed === "Yes" && weeklyOffWorkedStatus === "Grant Comp Off");

  return {
    policyName: text(config.policyName, defaults.policyName),
    policyCode: text(config.policyCode, defaults.policyCode),
    effectiveFrom: text(config.effectiveFrom, defaults.effectiveFrom),
    nextReviewDate: text(config.nextReviewDate, defaults.nextReviewDate),
    status: normalizeStoredStatus(config.status, defaults.status),
    defaultCompanyPolicy: normalizeYesNo(config.defaultCompanyPolicy, defaults.defaultCompanyPolicy),
    holidaySource: "Company",
    weeklyOffPattern: holidayWeeklyOffPatternFromRuntimePolicy(
      weeklyOffRuntimePolicyFromPattern(config.weeklyOffPattern),
    ),
    holidayPunchAllowed,
    weeklyOffPunchAllowed,
    holidayWorkedStatus,
    weeklyOffWorkedStatus,
    compOffValidityDays: compOffApplies
      ? wholeNumberString(config.compOffValidityDays, defaults.compOffValidityDays)
      : "0",
  };
}

export function holidayPolicyBridgeStatusFromStoredStatus(status: HolidayPolicyStoredStatus): HolidayPolicyBridgeStatus {
  if (status === "active") return "Active";
  if (status === "archived") return "Archived";
  return "Draft";
}
