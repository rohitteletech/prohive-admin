import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { leavePolicyFromDb } from "@/lib/companyLeaves";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { todayISOInIndia } from "@/lib/dateTime";

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
  maximumBackdatedLeaveDays?: string;
  ifEmployeePunchesOnApprovedLeave?: "Allow Punch and Send for Approval" | "Keep Leave" | "Block Punch";
  sandwichLeave?: "Enabled" | "Disabled";
  leaveTypes?: LeaveTypePayload[];
};

function comparePolicyPriority(
  a: { effectiveFrom: string; updatedAt: string; createdAt: string },
  b: { effectiveFrom: string; updatedAt: string; createdAt: string }
) {
  if (a.effectiveFrom !== b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom);
  if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
  return b.createdAt.localeCompare(a.createdAt);
}

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

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
    const today = todayISOInIndia();
    const leavePolicies = definitions.filter((policy) => policy.policyType === "leave");
    const effectiveLeavePolicies = leavePolicies
      .filter((policy) => policy.status === "active")
      .filter((policy) => policy.effectiveFrom <= today)
      .sort(comparePolicyPriority);
    const leavePolicy =
      effectiveLeavePolicies.find((policy) => policy.isDefault) ||
      effectiveLeavePolicies[0] ||
      leavePolicies.find((policy) => policy.isDefault) ||
      [...leavePolicies].sort(comparePolicyPriority)[0] ||
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
      maximumBackdatedLeaveDays: toNumberString(config.maximumBackdatedLeaveDays, "5"),
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

  const policyName = String(body.policyName || policy?.policyName || "").trim();
  const policyCode = String(body.policyCode || policy?.policyCode || "").trim();
  const effectiveFrom = String(body.effectiveFrom || policy?.effectiveFrom || "").trim();
  const nextReviewDate = String(body.nextReviewDate || policy?.nextReviewDate || "").trim();

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

  const existingPolicyId = policy?.id || "";
  const normalizedStatus =
    String(body.status || policy?.status || "Draft").trim().toLowerCase() === "active"
      ? "active"
      : String(body.status || policy?.status || "Draft").trim().toLowerCase() === "archived"
        ? "archived"
        : "draft";
  const requestedDefaultCompanyPolicy =
    String(body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No")).trim() === "Yes" ? "Yes" : "No";
  const normalizedDefaultCompanyPolicy = normalizedStatus === "active" && requestedDefaultCompanyPolicy === "Yes" ? "Yes" : "No";

  const trimmedLeaveTypes = leaveTypes.map((leaveType) => ({
    ...leaveType,
    id: String(leaveType.id || "").trim(),
    name: String(leaveType.name || "").trim(),
    code: String(leaveType.code || "").trim().toUpperCase(),
  }));
  const blankLeaveType = trimmedLeaveTypes.find((leaveType) => !leaveType.name || !leaveType.code);
  if (blankLeaveType) {
    return NextResponse.json({ error: "Each leave type must include both Leave Type Name and Leave Code." }, { status: 400 });
  }
  const duplicateLeaveCode = trimmedLeaveTypes.find((leaveType, index) =>
    trimmedLeaveTypes.findIndex((candidate) => candidate.code === leaveType.code) !== index,
  );
  if (duplicateLeaveCode) {
    return NextResponse.json({ error: `Leave Code ${duplicateLeaveCode.code} is duplicated in this policy.` }, { status: 400 });
  }

  const otherLeavePolicies = definitions.filter((definition) => definition.policyType === "leave" && definition.id !== existingPolicyId);
  if (normalizedStatus === "active") {
    const sameEffectiveDateActive = otherLeavePolicies.find(
      (definition) => definition.status === "active" && definition.effectiveFrom === effectiveFrom,
    );
    if (sameEffectiveDateActive) {
      return NextResponse.json(
        { error: `Another active leave policy is already scheduled for ${effectiveFrom}.` },
        { status: 400 },
      );
    }
  }

  const configJson = {
    policyName,
    policyCode,
    effectiveFrom,
    nextReviewDate,
    status: normalizedStatus,
    defaultCompanyPolicy: normalizedDefaultCompanyPolicy,
    leaveCycleType: body.leaveCycleType === "Financial Year" ? "Financial Year" : "Calendar Year",
    approvalFlow: body.approvalFlow || "manager_hr",
    noticePeriodDays: body.noticePeriodDays || "1",
    backdatedLeaveAllowed: body.backdatedLeaveAllowed || "No",
    maximumBackdatedLeaveDays:
      body.backdatedLeaveAllowed === "Yes" ? toNumberString(body.maximumBackdatedLeaveDays, "5") : "0",
    ifEmployeePunchesOnApprovedLeave: normalizePunchOnApprovedLeaveAction(
      body.ifEmployeePunchesOnApprovedLeave,
    ),
    sandwichLeave: body.sandwichLeave || "Disabled",
    leaveTypes: trimmedLeaveTypes.map((leaveType) => ({
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
  const today = todayISOInIndia();
  const isFutureEffectiveActive = configJson.status === "active" && configJson.effectiveFrom > today;

  if (isFutureEffectiveActive) {
    const overlappingFuturePolicy = otherLeavePolicies.find(
      (definition) => definition.status === "active" && definition.effectiveFrom > today,
    );
    if (overlappingFuturePolicy) {
      return NextResponse.json(
        {
          error:
            `Another future active leave policy is already scheduled from ${overlappingFuturePolicy.effectiveFrom}. ` +
            "Edit or archive that policy before scheduling a new one.",
        },
        { status: 400 },
      );
    }
  }

  const legacyRows = configJson.leaveTypes.map((leaveType) => ({
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

  const { data: savedPolicyId, error: saveError } = await context.admin.rpc("save_leave_policy_definition", {
    p_company_id: context.companyId,
    p_admin_email: context.adminEmail,
    p_policy_id: policy?.id ?? null,
    p_policy_name: configJson.policyName,
    p_policy_code: configJson.policyCode,
    p_status: configJson.status,
    p_effective_from: configJson.effectiveFrom,
    p_next_review_date: configJson.nextReviewDate,
    p_default_company_policy: configJson.defaultCompanyPolicy === "Yes",
    p_config_json: configJson,
    p_legacy_leave_rows: legacyRows,
  });

  if (saveError || !savedPolicyId) {
    return NextResponse.json({ error: saveError?.message || "Unable to save leave policy definition." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId: savedPolicyId });
}
