import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { leavePolicyFromDb } from "@/lib/companyLeaves";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";

type LeaveTypePayload = {
  id: string;
  name: string;
  code: string;
  paymentMode: "Paid" | "Unpaid";
  annualQuota: string;
  halfDayAllowed: "Yes" | "No";
  minimumDays: string;
  maximumDays: string;
  accrualRule: "Yearly Upfront" | "Monthly Accrual" | "Quarterly Accrual" | "Manual Credit Only";
  carryForwardAllowed: "Yes" | "No";
};

type LeaveBridgePayload = {
  policyId?: string;
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy?: "Yes" | "No";
  approvalFlow?: "manager" | "manager_hr" | "hr";
  noticePeriodDays?: string;
  backdatedLeaveAllowed?: "Yes" | "No";
  leaveOverridesAttendance?: "Yes" | "No";
  sandwichLeave?: "Enabled" | "Disabled";
  carryForwardEnabled?: "Yes" | "No";
  maximumCarryForwardDays?: string;
  carryForwardExpiryDays?: string;
  leaveTypes?: LeaveTypePayload[];
};

function normalizeAccrualRule(value: unknown): LeaveTypePayload["accrualRule"] {
  if (value === "Monthly Accrual") return "Monthly Accrual";
  if (value === "Quarterly Accrual") return "Quarterly Accrual";
  if (value === "Manual Credit Only") return "Manual Credit Only";
  return "Yearly Upfront";
}

function toLegacyAccrualMode(value: LeaveTypePayload["accrualRule"]) {
  return value === "Yearly Upfront" ? "upfront" : "monthly";
}

function fromLegacyAccrualMode(value: unknown): LeaveTypePayload["accrualRule"] {
  return value === "upfront" ? "Yearly Upfront" : "Monthly Accrual";
}

function toNumberString(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
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
    const leavePolicy =
      definitions.find((policy) => policy.policyType === "leave" && policy.isDefault) ||
      definitions.find((policy) => policy.policyType === "leave") ||
      null;
    if (!leavePolicy) {
      return NextResponse.json({ error: "Leave policy definition not found." }, { status: 404 });
    }

    const { data, error } = await context.admin
      .from("company_leave_policies")
      .select("id,name,code,annual_quota,carry_forward,accrual_mode,encashable,active")
      .eq("company_id", context.companyId)
      .order("active", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message || "Unable to load legacy leave policies." }, { status: 400 });
    }

    const config = (leavePolicy.configJson || {}) as Record<string, unknown>;
    const configLeaveTypes = Array.isArray(config.leaveTypes) ? (config.leaveTypes as LeaveTypePayload[]) : null;
    const legacyLeaveTypes = Array.isArray(data)
      ? data.map((row) => {
          const legacy = leavePolicyFromDb(row as Record<string, unknown>);
          return {
            id: legacy.id,
            name: legacy.name,
            code: legacy.code,
            paymentMode: "Paid" as const,
            annualQuota: String(legacy.annualQuota),
            halfDayAllowed: "Yes" as const,
            minimumDays: "1",
            maximumDays: String(Math.max(legacy.annualQuota, legacy.carryForward || 0, 1)),
            accrualRule: fromLegacyAccrualMode(legacy.accrualMode),
            carryForwardAllowed: (legacy.carryForward > 0 ? "Yes" : "No") as "Yes" | "No",
          } satisfies LeaveTypePayload;
        })
      : [];

    return NextResponse.json({
      policyId: leavePolicy.id,
      policyName: String(config.policyName || leavePolicy.policyName || "Standard Leave Policy"),
      policyCode: String(config.policyCode || leavePolicy.policyCode || "LEV-001"),
      effectiveFrom: String(config.effectiveFrom || leavePolicy.effectiveFrom),
      nextReviewDate: String(config.nextReviewDate || leavePolicy.nextReviewDate),
      status:
        String(config.status || leavePolicy.status || "draft").toLowerCase() === "active"
          ? "Active"
          : String(config.status || leavePolicy.status || "draft").toLowerCase() === "archived"
            ? "Archived"
            : "Draft",
      defaultCompanyPolicy: (config.defaultCompanyPolicy === "No" || leavePolicy.isDefault === false) ? "No" : "Yes",
      approvalFlow:
        config.approvalFlow === "manager" || config.approvalFlow === "hr" || config.approvalFlow === "manager_hr"
          ? config.approvalFlow
          : "manager_hr",
      noticePeriodDays: toNumberString(config.noticePeriodDays, "1"),
      backdatedLeaveAllowed: config.backdatedLeaveAllowed === "Yes" ? "Yes" : "No",
      leaveOverridesAttendance: config.leaveOverridesAttendance === "No" ? "No" : "Yes",
      sandwichLeave: config.sandwichLeave === "Enabled" ? "Enabled" : "Disabled",
      carryForwardEnabled: config.carryForwardEnabled === "No" ? "No" : "Yes",
      maximumCarryForwardDays: toNumberString(config.maximumCarryForwardDays, "10"),
      carryForwardExpiryDays: toNumberString(config.carryForwardExpiryDays, "90"),
      leaveTypes: configLeaveTypes && configLeaveTypes.length > 0 ? configLeaveTypes : legacyLeaveTypes,
    } satisfies LeaveBridgePayload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load leave policy bridge." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as LeaveBridgePayload;
  const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
  const policy =
    definitions.find((definition) => definition.id === body.policyId && definition.policyType === "leave") ||
    definitions.find((definition) => definition.policyType === "leave" && definition.isDefault) ||
    definitions.find((definition) => definition.policyType === "leave");

  if (!policy) {
    return NextResponse.json({ error: "Leave policy definition not found." }, { status: 404 });
  }

  const leaveTypes = Array.isArray(body.leaveTypes) ? body.leaveTypes : [];
  if (leaveTypes.length === 0) {
    return NextResponse.json({ error: "At least one leave type is required." }, { status: 400 });
  }

  const configJson = {
    policyName: body.policyName || policy.policyName,
    policyCode: body.policyCode || policy.policyCode,
    effectiveFrom: body.effectiveFrom || policy.effectiveFrom,
    nextReviewDate: body.nextReviewDate || policy.nextReviewDate,
    status: (body.status || "Draft").toLowerCase(),
    defaultCompanyPolicy: body.defaultCompanyPolicy || (policy.isDefault ? "Yes" : "No"),
    approvalFlow: body.approvalFlow || "manager_hr",
    noticePeriodDays: body.noticePeriodDays || "1",
    backdatedLeaveAllowed: body.backdatedLeaveAllowed || "No",
    leaveOverridesAttendance: body.leaveOverridesAttendance || "Yes",
    sandwichLeave: body.sandwichLeave || "Disabled",
    carryForwardEnabled: body.carryForwardEnabled || "Yes",
    maximumCarryForwardDays: body.maximumCarryForwardDays || "10",
    carryForwardExpiryDays: body.carryForwardExpiryDays || "90",
    leaveTypes: leaveTypes.map((leaveType) => ({
      ...leaveType,
      accrualRule: normalizeAccrualRule(leaveType.accrualRule),
      annualQuota: toNumberString(leaveType.annualQuota, "0"),
      minimumDays: toNumberString(leaveType.minimumDays, "1"),
      maximumDays: toNumberString(leaveType.maximumDays, "1"),
    })),
  };

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
    return NextResponse.json({ error: policyError.message || "Unable to save leave policy definition." }, { status: 400 });
  }

  const { error: deleteError } = await context.admin
    .from("company_leave_policies")
    .delete()
    .eq("company_id", context.companyId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Unable to replace legacy leave policies." }, { status: 400 });
  }

  const legacyRows = configJson.leaveTypes.map((leaveType) => ({
    company_id: context.companyId,
    name: String(leaveType.name || "").trim() || "Leave Type",
    code: String(leaveType.code || "").trim().toUpperCase() || "LV",
    annual_quota: Math.max(0, Math.round(Number(leaveType.annualQuota || 0))),
    carry_forward:
      leaveType.carryForwardAllowed === "Yes" && configJson.carryForwardEnabled === "Yes"
        ? Math.max(0, Math.round(Number(configJson.maximumCarryForwardDays || 0)))
        : 0,
    accrual_mode: toLegacyAccrualMode(leaveType.accrualRule),
    encashable: false,
    active: true,
  }));

  const { error: insertError } = await context.admin.from("company_leave_policies").insert(legacyRows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message || "Unable to sync legacy leave policies." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
