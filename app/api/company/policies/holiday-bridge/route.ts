import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { normalizeWeeklyOffPolicy } from "@/lib/weeklyOff";

type HolidayBridgePayload = {
  policyId?: string;
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy?: "Yes" | "No";
  holidaySource?: "Company" | "Government" | "Mixed";
  weeklyOffPattern?: "Sunday Only" | "Saturday + Sunday" | "Alternate Saturday + Sunday" | "Custom";
  customWeeklyOffPattern?: string;
  holidayPunchAllowed?: "Yes" | "No";
  weeklyOffPunchAllowed?: "Yes" | "No";
  holidayWorkedStatus?: "Holiday Worked" | "Present" | "OT Only";
  weeklyOffWorkedStatus?: "Weekly Off Worked" | "Present" | "OT Only";
  compOffEnabled?: "Yes" | "No";
  compOffValidityDays?: string;
};

function toNewWeeklyOffPattern(value: unknown): HolidayBridgePayload["weeklyOffPattern"] {
  const normalized = normalizeWeeklyOffPolicy(value);
  if (normalized === "saturday_sunday") return "Saturday + Sunday";
  if (normalized === "second_fourth_saturday_sunday") return "Alternate Saturday + Sunday";
  return "Sunday Only";
}

function toLegacyWeeklyOffPattern(value: HolidayBridgePayload["weeklyOffPattern"], customPattern: string) {
  if (value === "Saturday + Sunday") return "saturday_sunday";
  if (value === "Alternate Saturday + Sunday") return "second_fourth_saturday_sunday";
  if (value === "Custom") {
    const text = customPattern.trim().toLowerCase();
    if (text.includes("2nd") || text.includes("4th") || text.includes("second") || text.includes("fourth")) {
      return "second_fourth_saturday_sunday";
    }
    if (text.includes("saturday")) return "saturday_sunday";
  }
  return "sunday_only";
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
    const holidayPolicy =
      definitions.find((policy) => policy.policyType === "holiday_weekoff" && policy.isDefault) ||
      definitions.find((policy) => policy.policyType === "holiday_weekoff") ||
      null;
    if (!holidayPolicy) {
      return NextResponse.json({ error: "Holiday policy definition not found." }, { status: 404 });
    }

    const [companyResult, holidayResult] = await Promise.all([
      context.admin
        .from("companies")
        .select("weekly_off_policy,allow_punch_on_holiday,allow_punch_on_weekly_off")
        .eq("id", context.companyId)
        .maybeSingle(),
      context.admin
        .from("company_holidays")
        .select("id")
        .eq("company_id", context.companyId)
        .limit(1),
    ]);

    if (companyResult.error) {
      return NextResponse.json({ error: companyResult.error.message || "Unable to load legacy holiday settings." }, { status: 400 });
    }
    if (holidayResult.error) {
      return NextResponse.json({ error: holidayResult.error.message || "Unable to inspect legacy holiday rows." }, { status: 400 });
    }

    const config = (holidayPolicy.configJson || {}) as Record<string, unknown>;
    const hasCompanyHolidays = Array.isArray(holidayResult.data) && holidayResult.data.length > 0;

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
      holidaySource:
        config.holidaySource === "Company" || config.holidaySource === "Government" || config.holidaySource === "Mixed"
          ? config.holidaySource
          : hasCompanyHolidays
            ? "Mixed"
            : "Government",
      weeklyOffPattern:
        config.weeklyOffPattern === "Saturday + Sunday" ||
        config.weeklyOffPattern === "Alternate Saturday + Sunday" ||
        config.weeklyOffPattern === "Custom"
          ? config.weeklyOffPattern
          : toNewWeeklyOffPattern(companyResult.data?.weekly_off_policy),
      customWeeklyOffPattern: String(config.customWeeklyOffPattern || ""),
      holidayPunchAllowed: config.holidayPunchAllowed === "No" || companyResult.data?.allow_punch_on_holiday === false ? "No" : "Yes",
      weeklyOffPunchAllowed:
        config.weeklyOffPunchAllowed === "No" || companyResult.data?.allow_punch_on_weekly_off === false ? "No" : "Yes",
      holidayWorkedStatus:
        config.holidayWorkedStatus === "Present" || config.holidayWorkedStatus === "OT Only"
          ? config.holidayWorkedStatus
          : "Holiday Worked",
      weeklyOffWorkedStatus:
        config.weeklyOffWorkedStatus === "Present" || config.weeklyOffWorkedStatus === "OT Only"
          ? config.weeklyOffWorkedStatus
          : "Weekly Off Worked",
      compOffEnabled: config.compOffEnabled === "No" ? "No" : "Yes",
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
    policyName: body.policyName || policy?.policyName || "Standard Holiday Policy",
    policyCode: body.policyCode || policy?.policyCode || "HOL-001",
    effectiveFrom: body.effectiveFrom || policy?.effectiveFrom || new Date().toISOString().slice(0, 10),
    nextReviewDate: body.nextReviewDate || policy?.nextReviewDate || new Date().toISOString().slice(0, 10),
    status: (body.status || "Draft").toLowerCase(),
    defaultCompanyPolicy: body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No"),
    holidaySource: body.holidaySource || "Mixed",
    weeklyOffPattern: body.weeklyOffPattern || "Sunday Only",
    customWeeklyOffPattern: body.customWeeklyOffPattern || "",
    holidayPunchAllowed: body.holidayPunchAllowed || "Yes",
    weeklyOffPunchAllowed: body.weeklyOffPunchAllowed || "Yes",
    holidayWorkedStatus: body.holidayWorkedStatus || "Holiday Worked",
    weeklyOffWorkedStatus: body.weeklyOffWorkedStatus || "Weekly Off Worked",
    compOffEnabled: body.compOffEnabled || "Yes",
    compOffValidityDays: String(body.compOffValidityDays || "60"),
  };

  if (configJson.defaultCompanyPolicy === "Yes") {
    const { error: clearDefaultError } = await context.admin
      .from("company_policy_definitions")
      .update({ is_default: false })
      .eq("company_id", context.companyId)
      .eq("policy_type", "holiday_weekoff");
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

  const { error: companyError } = await context.admin
    .from("companies")
    .update({
      weekly_off_policy: toLegacyWeeklyOffPattern(configJson.weeklyOffPattern, configJson.customWeeklyOffPattern),
      allow_punch_on_holiday: configJson.holidayPunchAllowed === "Yes",
      allow_punch_on_weekly_off: configJson.weeklyOffPunchAllowed === "Yes",
    })
    .eq("id", context.companyId);

  if (companyError) {
    return NextResponse.json({ error: companyError.message || "Unable to sync legacy holiday settings." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId });
}
