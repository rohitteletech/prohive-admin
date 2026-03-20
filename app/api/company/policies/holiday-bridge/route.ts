import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";

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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
    const today = new Date().toISOString().slice(0, 10);
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

    const holidayResult = await context.admin
        .from("company_holidays")
        .select("id")
        .eq("company_id", context.companyId)
        .limit(1);
    if (holidayResult.error) {
      return NextResponse.json({ error: holidayResult.error.message || "Unable to inspect legacy holiday rows." }, { status: 400 });
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

  const configJson = {
    holidayPunchAllowed: body.holidayPunchAllowed || "Yes",
    weeklyOffPunchAllowed: body.weeklyOffPunchAllowed || "Yes",
    policyName: body.policyName || policy?.policyName || "Standard Holiday Policy",
    policyCode: body.policyCode || policy?.policyCode || "HOL-001",
    effectiveFrom: body.effectiveFrom || policy?.effectiveFrom || new Date().toISOString().slice(0, 10),
    nextReviewDate: body.nextReviewDate || policy?.nextReviewDate || new Date().toISOString().slice(0, 10),
    status: (body.status || "Draft").toLowerCase(),
    defaultCompanyPolicy: body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No"),
    holidaySource: "Company",
    weeklyOffPattern: body.weeklyOffPattern || "Sunday Only",
    holidayWorkedStatus:
      (body.holidayPunchAllowed || "Yes") === "Yes"
        ? body.holidayWorkedStatus || "Grant Comp Off"
        : "Record Only",
    weeklyOffWorkedStatus:
      (body.weeklyOffPunchAllowed || "Yes") === "Yes"
        ? body.weeklyOffWorkedStatus || "Grant Comp Off"
        : "Record Only",
    compOffValidityDays: "0",
  };

  const compOffApplies =
    (configJson.holidayPunchAllowed === "Yes" && configJson.holidayWorkedStatus === "Grant Comp Off") ||
    (configJson.weeklyOffPunchAllowed === "Yes" && configJson.weeklyOffWorkedStatus === "Grant Comp Off");
  configJson.compOffValidityDays = String(compOffApplies ? body.compOffValidityDays || "60" : "0");
  const today = new Date().toISOString().slice(0, 10);
  const isFutureEffectiveActive = configJson.status === "active" && configJson.effectiveFrom > today;

  if (configJson.status === "active") {
    const archiveQuery = context.admin
      .from("company_policy_definitions")
      .update({
        status: "archived",
        is_default: false,
      })
      .eq("company_id", context.companyId)
      .eq("policy_type", "holiday_weekoff")
      .eq("status", "active");
    const scopedArchiveQuery = isFutureEffectiveActive
      ? archiveQuery.eq("effective_from", configJson.effectiveFrom)
      : archiveQuery.lte("effective_from", configJson.effectiveFrom);
    const { error: archiveError } = policy?.id ? await scopedArchiveQuery.neq("id", policy.id) : await scopedArchiveQuery;
    if (archiveError) {
      return NextResponse.json({ error: archiveError.message || "Unable to archive existing active holiday policies." }, { status: 400 });
    }
  }

  if (configJson.defaultCompanyPolicy === "Yes") {
    const clearDefaultQuery = context.admin
      .from("company_policy_definitions")
      .update({ is_default: false })
      .eq("company_id", context.companyId)
      .eq("policy_type", "holiday_weekoff");
    const scopedDefaultQuery = isFutureEffectiveActive
      ? clearDefaultQuery.eq("effective_from", configJson.effectiveFrom)
      : clearDefaultQuery.lte("effective_from", configJson.effectiveFrom);
    const { error: clearDefaultError } = policy?.id ? await scopedDefaultQuery.neq("id", policy.id) : await scopedDefaultQuery;
    if (clearDefaultError) {
      return NextResponse.json({ error: clearDefaultError.message || "Unable to reset existing default holiday policy." }, { status: 400 });
    }
  }

  let policyId = policy?.id || "";
  if (policy) {
    const { error: policyError } = await context.admin
      .from("company_policy_definitions")
      .update({
        policy_name: configJson.policyName,
        policy_code: configJson.policyCode,
        status: configJson.status,
        is_default: configJson.defaultCompanyPolicy === "Yes",
        effective_from: configJson.effectiveFrom,
        next_review_date: configJson.nextReviewDate,
        config_json: configJson,
      })
      .eq("company_id", context.companyId)
      .eq("id", policy.id);

    if (policyError) {
      return NextResponse.json({ error: policyError.message || "Unable to save holiday policy definition." }, { status: 400 });
    }
  } else {
    const { data: insertedPolicy, error: insertPolicyError } = await context.admin
      .from("company_policy_definitions")
      .insert({
        company_id: context.companyId,
        policy_type: "holiday_weekoff",
        policy_name: configJson.policyName,
        policy_code: configJson.policyCode,
        status: configJson.status,
        is_default: configJson.defaultCompanyPolicy === "Yes",
        effective_from: configJson.effectiveFrom,
        next_review_date: configJson.nextReviewDate,
        config_json: configJson,
        created_by: context.adminEmail,
      })
      .select("id")
      .maybeSingle();

    if (insertPolicyError || !insertedPolicy?.id) {
      return NextResponse.json({ error: insertPolicyError?.message || "Unable to create holiday policy definition." }, { status: 400 });
    }
    policyId = insertedPolicy.id;
  }

  return NextResponse.json({ ok: true, policyId });
}
