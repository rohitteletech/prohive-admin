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
  accrualRule: "Yearly Upfront" | "Monthly Accrual";
  carryForwardAllowed: "Yes" | "No";
  maximumCarryForwardDays: string;
  carryForwardExpiryDays: string;
};

type LeaveBridgePayload = {
  policyId?: string;
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy?: "Yes" | "No";
  leaveCycleType?: "Calendar Year" | "Financial Year";
  approvalFlow?: "manager" | "manager_hr" | "hr";
  noticePeriodDays?: string;
  backdatedLeaveAllowed?: "Yes" | "No";
  ifEmployeePunchesOnApprovedLeave?: "Allow Punch and Send for Approval" | "Keep Leave" | "Block Punch";
  sandwichLeave?: "Enabled" | "Disabled";
  leaveTypes?: LeaveTypePayload[];
};

function normalizeAccrualRule(value: unknown): LeaveTypePayload["accrualRule"] {
  if (value === "Monthly Accrual") return "Monthly Accrual";
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

function normalizePunchOnApprovedLeaveAction(
  value: unknown,
): NonNullable<LeaveBridgePayload["ifEmployeePunchesOnApprovedLeave"]> {
  const text = String(value || "").trim();
  if (text === "Keep Leave" || text === "Block Punch" || text === "Allow Punch and Send for Approval") {
    return text;
  }
  if (text === "Yes") return "Keep Leave";
  if (text === "No") return "Allow Punch and Send for Approval";
  return "Allow Punch and Send for Approval";
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
            accrualRule: fromLegacyAccrualMode(legacy.accrualMode),
            carryForwardAllowed: (legacy.carryForward > 0 ? "Yes" : "No") as "Yes" | "No",
            maximumCarryForwardDays: String(legacy.carryForward > 0 ? legacy.carryForward : 0),
            carryForwardExpiryDays: "90",
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
      leaveCycleType: config.leaveCycleType === "Financial Year" ? "Financial Year" : "Calendar Year",
      approvalFlow:
        config.approvalFlow === "manager" || config.approvalFlow === "hr" || config.approvalFlow === "manager_hr"
          ? config.approvalFlow
          : "manager_hr",
      noticePeriodDays: toNumberString(config.noticePeriodDays, "1"),
      backdatedLeaveAllowed: config.backdatedLeaveAllowed === "Yes" ? "Yes" : "No",
      ifEmployeePunchesOnApprovedLeave: normalizePunchOnApprovedLeaveAction(
        config.ifEmployeePunchesOnApprovedLeave ?? config.leaveOverridesAttendance,
      ),
      sandwichLeave: config.sandwichLeave === "Enabled" ? "Enabled" : "Disabled",
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
  const policy = body.policyId
    ? definitions.find((definition) => definition.id === body.policyId && definition.policyType === "leave")
    : null;

  const leaveTypes = Array.isArray(body.leaveTypes) ? body.leaveTypes : [];
  if (leaveTypes.length === 0) {
    return NextResponse.json({ error: "At least one leave type is required." }, { status: 400 });
  }

  const configJson = {
    policyName: body.policyName || policy?.policyName || "Standard Leave Policy",
    policyCode: body.policyCode || policy?.policyCode || "LEV-001",
    effectiveFrom: body.effectiveFrom || policy?.effectiveFrom || new Date().toISOString().slice(0, 10),
    nextReviewDate: body.nextReviewDate || policy?.nextReviewDate || new Date().toISOString().slice(0, 10),
    status: (body.status || "Draft").toLowerCase(),
    defaultCompanyPolicy: body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No"),
    leaveCycleType: body.leaveCycleType === "Financial Year" ? "Financial Year" : "Calendar Year",
    approvalFlow: body.approvalFlow || "manager_hr",
    noticePeriodDays: body.noticePeriodDays || "1",
    backdatedLeaveAllowed: body.backdatedLeaveAllowed || "No",
    ifEmployeePunchesOnApprovedLeave: normalizePunchOnApprovedLeaveAction(
      body.ifEmployeePunchesOnApprovedLeave,
    ),
    sandwichLeave: body.sandwichLeave || "Disabled",
    leaveTypes: leaveTypes.map((leaveType) => ({
      ...leaveType,
      accrualRule: normalizeAccrualRule(leaveType.accrualRule),
      annualQuota: toNumberString(leaveType.annualQuota, "0"),
      carryForwardAllowed: leaveType.carryForwardAllowed === "Yes" ? "Yes" : "No",
      maximumCarryForwardDays:
        leaveType.carryForwardAllowed === "Yes" ? toNumberString(leaveType.maximumCarryForwardDays, "0") : "0",
      carryForwardExpiryDays:
        leaveType.carryForwardAllowed === "Yes" ? toNumberString(leaveType.carryForwardExpiryDays, "0") : "0",
    })),
  };

  if (configJson.status === "active") {
    const archiveQuery = context.admin
      .from("company_policy_definitions")
      .update({
        status: "archived",
        is_default: false,
      })
      .eq("company_id", context.companyId)
      .eq("policy_type", "leave")
      .eq("status", "active");

    const { error: archiveError } = policy?.id ? await archiveQuery.neq("id", policy.id) : await archiveQuery;
    if (archiveError) {
      return NextResponse.json({ error: archiveError.message || "Unable to archive existing active leave policies." }, { status: 400 });
    }
  }

  if (configJson.defaultCompanyPolicy === "Yes") {
    const { error: clearDefaultError } = await context.admin
      .from("company_policy_definitions")
      .update({ is_default: false })
      .eq("company_id", context.companyId)
      .eq("policy_type", "leave");
    if (clearDefaultError) {
      return NextResponse.json({ error: clearDefaultError.message || "Unable to reset existing default leave policy." }, { status: 400 });
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
      return NextResponse.json({ error: policyError.message || "Unable to save leave policy definition." }, { status: 400 });
    }
  } else {
    const { data: insertedPolicy, error: insertPolicyError } = await context.admin
      .from("company_policy_definitions")
      .insert({
        company_id: context.companyId,
        policy_type: "leave",
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
      return NextResponse.json({ error: insertPolicyError?.message || "Unable to create leave policy definition." }, { status: 400 });
    }
    policyId = insertedPolicy.id;
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
      leaveType.carryForwardAllowed === "Yes"
        ? Math.max(0, Math.round(Number(leaveType.maximumCarryForwardDays || 0)))
        : 0,
    accrual_mode: toLegacyAccrualMode(leaveType.accrualRule),
    encashable: false,
    active: true,
  }));

  const { error: insertError } = await context.admin.from("company_leave_policies").insert(legacyRows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message || "Unable to sync legacy leave policies." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId });
}
