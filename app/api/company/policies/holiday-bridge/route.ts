import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { todayISOInIndia } from "@/lib/dateTime";

type HolidayBridgePayload = {
  policyId?: string;
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy?: "Yes" | "No";
  weeklyOffPattern?: "Sunday Only" | "Saturday + Sunday" | "2nd and 4th Saturday + Sunday";
  holidayPunchAllowed?: "Yes" | "No";
  weeklyOffPunchAllowed?: "Yes" | "No";
  holidayWorkedStatus?: "Record Only" | "OT Only" | "Grant Comp Off" | "Present + OT" | "Manual Review";
  weeklyOffWorkedStatus?: "Record Only" | "OT Only" | "Grant Comp Off" | "Present + OT" | "Manual Review";
  compOffValidityDays?: string;
};

function comparePolicyPriority(
  a: { effectiveFrom: string; updatedAt: string; createdAt: string },
  b: { effectiveFrom: string; updatedAt: string; createdAt: string }
) {
  if (a.effectiveFrom !== b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom);
  if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
  return b.createdAt.localeCompare(a.createdAt);
}

function normalizeWorkedDayTreatment(
  value: unknown,
  fallback: "Record Only" | "OT Only" | "Grant Comp Off" | "Present + OT" | "Manual Review",
) {
  const text = String(value || "").trim();
  if (text === "Record Only" || text === "OT Only" || text === "Grant Comp Off" || text === "Present + OT" || text === "Manual Review") {
    return text;
  }
  if (text === "Holiday Worked" || text === "Weekly Off Worked") return "Grant Comp Off";
  if (text === "Present") return "Present + OT";
  return fallback;
}

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isAllowedChoice<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

const HOLIDAY_STATUS_VALUES = ["draft", "active", "archived"] as const;
const DEFAULT_POLICY_VALUES = ["Yes", "No"] as const;
const PUNCH_ALLOWED_VALUES = ["Yes", "No"] as const;
const WEEKLY_OFF_PATTERN_VALUES = ["Sunday Only", "Saturday + Sunday", "2nd and 4th Saturday + Sunday"] as const;
const WORKED_DAY_VALUES = ["Record Only", "OT Only", "Grant Comp Off", "Present + OT", "Manual Review"] as const;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
    const today = todayISOInIndia();
    const holidayPolicies = definitions.filter((policy) => policy.policyType === "holiday_weekoff");
    const effectiveHolidayPolicies = holidayPolicies
      .filter((policy) => policy.status === "active")
      .filter((policy) => policy.effectiveFrom <= today)
      .sort(comparePolicyPriority);
    const holidayPolicy =
      effectiveHolidayPolicies.find((policy) => policy.isDefault) ||
      effectiveHolidayPolicies[0] ||
      holidayPolicies.find((policy) => policy.isDefault) ||
      [...holidayPolicies].sort(comparePolicyPriority)[0] ||
      null;
    if (!holidayPolicy) {
      return NextResponse.json({ error: "Holiday policy definition not found." }, { status: 404 });
    }

    const config = (holidayPolicy.configJson || {}) as Record<string, unknown>;

    return NextResponse.json({
      policyId: holidayPolicy.id,
      policyName: String(config.policyName || holidayPolicy.policyName || "Standard Holiday Policy"),
      policyCode: String(config.policyCode || holidayPolicy.policyCode || "HOL-001"),
      effectiveFrom: String(config.effectiveFrom || holidayPolicy.effectiveFrom),
      nextReviewDate: String(config.nextReviewDate || holidayPolicy.nextReviewDate),
      status:
        String(config.status || holidayPolicy.status || "draft").toLowerCase() === "active"
          ? "Active"
          : String(config.status || holidayPolicy.status || "draft").toLowerCase() === "archived"
            ? "Archived"
            : "Draft",
      defaultCompanyPolicy: (config.defaultCompanyPolicy === "No" || holidayPolicy.isDefault === false) ? "No" : "Yes",
      weeklyOffPattern:
        config.weeklyOffPattern === "Saturday + Sunday" ||
        config.weeklyOffPattern === "2nd and 4th Saturday + Sunday"
          ? config.weeklyOffPattern
          : config.weeklyOffPattern === "Alternate Saturday + Sunday"
            ? "2nd and 4th Saturday + Sunday"
          : "Sunday Only",
      holidayPunchAllowed: config.holidayPunchAllowed === "No" ? "No" : "Yes",
      weeklyOffPunchAllowed: config.weeklyOffPunchAllowed === "No" ? "No" : "Yes",
      holidayWorkedStatus: normalizeWorkedDayTreatment(config.holidayWorkedStatus, "Grant Comp Off"),
      weeklyOffWorkedStatus: normalizeWorkedDayTreatment(config.weeklyOffWorkedStatus, "Grant Comp Off"),
      compOffValidityDays: String(config.compOffValidityDays || "60"),
    } satisfies HolidayBridgePayload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load holiday policy bridge." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as HolidayBridgePayload;
  const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
  const policy = body.policyId
    ? definitions.find((definition) => definition.id === body.policyId && definition.policyType === "holiday_weekoff")
    : null;
  const policyName = String(body.policyName || policy?.policyName || "").trim();
  const policyCode = String(body.policyCode || policy?.policyCode || "").trim();
  const effectiveFrom = String(body.effectiveFrom || policy?.effectiveFrom || "").trim();
  const nextReviewDate = String(body.nextReviewDate || policy?.nextReviewDate || "").trim();
  const normalizedStatus = String(body.status || policy?.status || "Draft").trim().toLowerCase();
  const normalizedDefaultCompanyPolicy = String(body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No")).trim();
  const holidayPunchAllowed = String(body.holidayPunchAllowed || "Yes").trim();
  const weeklyOffPunchAllowed = String(body.weeklyOffPunchAllowed || "Yes").trim();
  const weeklyOffPattern = String(body.weeklyOffPattern || "Sunday Only").trim();
  const holidayWorkedStatus = String(body.holidayWorkedStatus || "Grant Comp Off").trim();
  const weeklyOffWorkedStatus = String(body.weeklyOffWorkedStatus || "Grant Comp Off").trim();

  if (!policyName) {
    return NextResponse.json({ error: "Policy Name is required." }, { status: 400 });
  }
  if (!policyCode) {
    return NextResponse.json({ error: "Policy Code is required." }, { status: 400 });
  }
  if (!effectiveFrom || !isValidIsoDate(effectiveFrom)) {
    return NextResponse.json({ error: "Valid Effective From date is required." }, { status: 400 });
  }
  if (!nextReviewDate || !isValidIsoDate(nextReviewDate)) {
    return NextResponse.json({ error: "Valid Next Review Date is required." }, { status: 400 });
  }
  if (nextReviewDate < effectiveFrom) {
    return NextResponse.json({ error: "Next Review Date cannot be earlier than Effective From date." }, { status: 400 });
  }
  if (!isAllowedChoice(normalizedStatus, HOLIDAY_STATUS_VALUES)) {
    return NextResponse.json({ error: "Valid policy status is required." }, { status: 400 });
  }
  if (!isAllowedChoice(normalizedDefaultCompanyPolicy, DEFAULT_POLICY_VALUES)) {
    return NextResponse.json({ error: "Default Company Policy must be Yes or No." }, { status: 400 });
  }
  if (!isAllowedChoice(holidayPunchAllowed, PUNCH_ALLOWED_VALUES)) {
    return NextResponse.json({ error: "Holiday Punch Allowed must be Yes or No." }, { status: 400 });
  }
  if (!isAllowedChoice(weeklyOffPunchAllowed, PUNCH_ALLOWED_VALUES)) {
    return NextResponse.json({ error: "Weekly Off Punch Allowed must be Yes or No." }, { status: 400 });
  }
  if (!isAllowedChoice(weeklyOffPattern, WEEKLY_OFF_PATTERN_VALUES)) {
    return NextResponse.json({ error: "Weekly Off Pattern is invalid." }, { status: 400 });
  }
  if (!isAllowedChoice(holidayWorkedStatus, WORKED_DAY_VALUES)) {
    return NextResponse.json({ error: "If Punched On Holiday value is invalid." }, { status: 400 });
  }
  if (!isAllowedChoice(weeklyOffWorkedStatus, WORKED_DAY_VALUES)) {
    return NextResponse.json({ error: "If Punched On Weekly Off value is invalid." }, { status: 400 });
  }

  const configJson = {
    holidayPunchAllowed,
    weeklyOffPunchAllowed,
    policyName,
    policyCode,
    effectiveFrom,
    nextReviewDate,
    status: normalizedStatus,
    defaultCompanyPolicy: normalizedDefaultCompanyPolicy,
    holidaySource: "Company",
    weeklyOffPattern,
    holidayWorkedStatus:
      holidayPunchAllowed === "Yes"
        ? holidayWorkedStatus
        : "Record Only",
    weeklyOffWorkedStatus:
      weeklyOffPunchAllowed === "Yes"
        ? weeklyOffWorkedStatus
        : "Record Only",
    compOffValidityDays: "0",
  };

  const compOffApplies =
    (configJson.holidayPunchAllowed === "Yes" && configJson.holidayWorkedStatus === "Grant Comp Off") ||
    (configJson.weeklyOffPunchAllowed === "Yes" && configJson.weeklyOffWorkedStatus === "Grant Comp Off");
  const compOffValidityText = String(body.compOffValidityDays || "").trim();
  if (compOffApplies) {
    if (!/^\d+$/.test(compOffValidityText || "60")) {
      return NextResponse.json({ error: "Comp Off Validity (Days) must be a whole number." }, { status: 400 });
    }
    const compOffValidityDays = Number(compOffValidityText || "60");
    if (!Number.isFinite(compOffValidityDays) || compOffValidityDays < 1 || compOffValidityDays > 365) {
      return NextResponse.json({ error: "Comp Off Validity (Days) must be between 1 and 365." }, { status: 400 });
    }
    configJson.compOffValidityDays = String(compOffValidityDays);
  } else {
    configJson.compOffValidityDays = "0";
  }
  const { data: savedPolicyId, error: saveError } = await context.admin.rpc("save_holiday_policy_definition", {
    p_company_id: context.companyId,
    p_admin_email: context.adminEmail,
    p_policy_id: policy?.id || null,
    p_policy_name: configJson.policyName,
    p_policy_code: configJson.policyCode,
    p_status: configJson.status,
    p_effective_from: configJson.effectiveFrom,
    p_next_review_date: configJson.nextReviewDate,
    p_default_company_policy: configJson.defaultCompanyPolicy === "Yes",
    p_config_json: configJson,
  });

  if (saveError || !savedPolicyId) {
    return NextResponse.json({ error: saveError?.message || "Unable to save holiday policy definition." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId: savedPolicyId });
}
