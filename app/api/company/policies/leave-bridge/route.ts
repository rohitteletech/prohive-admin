import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { todayISOInIndia } from "@/lib/dateTime";
import { normalizeLeavePolicyConfig, normalizePunchOnApprovedLeaveAction } from "@/lib/leavePolicyDefaults";

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
  ifEmployeePunchesOnApprovedLeave?: "Allow Punch and Send for Manual Review" | "Keep Leave" | "Block Punch";
  sandwichLeave?: "Enabled" | "Disabled";
  leaveTypes?: LeaveTypePayload[];
};

const MAX_ANNUAL_QUOTA = 366;
const MAX_NOTICE_PERIOD_DAYS = 365;
const MAX_BACKDATED_LEAVE_DAYS = 365;
const MAX_CARRY_FORWARD_DAYS = 366;
const MAX_CARRY_FORWARD_EXPIRY_DAYS = 3650;

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

function parseWholeNumberWithinRange(value: unknown, fallback: number, max: number) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return fallback;
  return Math.min(Number(text), max);
}

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

    const config = normalizeLeavePolicyConfig((leavePolicy.configJson || {}) as Record<string, unknown>, {
      policyName: leavePolicy.policyName,
      policyCode: leavePolicy.policyCode,
      effectiveFrom: leavePolicy.effectiveFrom,
      nextReviewDate: leavePolicy.nextReviewDate,
      status: leavePolicy.status,
      defaultCompanyPolicy: leavePolicy.isDefault ? "Yes" : "No",
    });

    return NextResponse.json({
      policyId: leavePolicy.id,
      policyName: config.policyName,
      policyCode: config.policyCode,
      effectiveFrom: config.effectiveFrom,
      nextReviewDate: config.nextReviewDate,
      status: config.status === "active" ? "Active" : config.status === "archived" ? "Archived" : "Draft",
      defaultCompanyPolicy: config.defaultCompanyPolicy,
      leaveCycleType: config.leaveCycleType,
      approvalFlow: config.approvalFlow,
      noticePeriodDays: config.noticePeriodDays,
      backdatedLeaveAllowed: config.backdatedLeaveAllowed,
      maximumBackdatedLeaveDays: config.maximumBackdatedLeaveDays,
      ifEmployeePunchesOnApprovedLeave: config.ifEmployeePunchesOnApprovedLeave,
      sandwichLeave: config.sandwichLeave,
      leaveTypes: config.leaveTypes,
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
  const invalidAnnualQuota = trimmedLeaveTypes.find((leaveType) => parseWholeNumberWithinRange(leaveType.annualQuota, -1, MAX_ANNUAL_QUOTA) < 0);
  if (invalidAnnualQuota) {
    return NextResponse.json({ error: "Annual Quota must be a whole number." }, { status: 400 });
  }
  const annualQuotaTooHigh = trimmedLeaveTypes.find((leaveType) => Number(String(leaveType.annualQuota || "").trim() || "0") > MAX_ANNUAL_QUOTA);
  if (annualQuotaTooHigh) {
    return NextResponse.json({ error: `Annual Quota cannot exceed ${MAX_ANNUAL_QUOTA} days.` }, { status: 400 });
  }
  const maximumCarryForwardTooHigh = trimmedLeaveTypes.find(
    (leaveType) =>
      leaveType.carryForwardAllowed === "Yes" &&
      Number(String(leaveType.maximumCarryForwardDays || "").trim() || "0") > MAX_CARRY_FORWARD_DAYS,
  );
  if (maximumCarryForwardTooHigh) {
    return NextResponse.json({ error: `Maximum Carry Forward Days cannot exceed ${MAX_CARRY_FORWARD_DAYS}.` }, { status: 400 });
  }
  const carryForwardExpiryTooHigh = trimmedLeaveTypes.find(
    (leaveType) =>
      leaveType.carryForwardAllowed === "Yes" &&
      Number(String(leaveType.carryForwardExpiryDays || "").trim() || "0") > MAX_CARRY_FORWARD_EXPIRY_DAYS,
  );
  if (carryForwardExpiryTooHigh) {
    return NextResponse.json({ error: `Carry Forward Expiry cannot exceed ${MAX_CARRY_FORWARD_EXPIRY_DAYS} days.` }, { status: 400 });
  }
  const noticePeriodDays = parseWholeNumberWithinRange(body.noticePeriodDays, 1, MAX_NOTICE_PERIOD_DAYS);
  if (Number(String(body.noticePeriodDays ?? "").trim() || "1") > MAX_NOTICE_PERIOD_DAYS) {
    return NextResponse.json({ error: `Notice Period cannot exceed ${MAX_NOTICE_PERIOD_DAYS} days.` }, { status: 400 });
  }
  const maximumBackdatedLeaveDays = body.backdatedLeaveAllowed === "Yes"
    ? parseWholeNumberWithinRange(body.maximumBackdatedLeaveDays, 5, MAX_BACKDATED_LEAVE_DAYS)
    : 0;
  if (
    body.backdatedLeaveAllowed === "Yes" &&
    Number(String(body.maximumBackdatedLeaveDays ?? "").trim() || "0") > MAX_BACKDATED_LEAVE_DAYS
  ) {
    return NextResponse.json({ error: `Maximum Backdated Leave Days cannot exceed ${MAX_BACKDATED_LEAVE_DAYS}.` }, { status: 400 });
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

  const configJson = normalizeLeavePolicyConfig({
    policyName,
    policyCode,
    effectiveFrom,
    nextReviewDate,
    status: normalizedStatus,
    defaultCompanyPolicy: normalizedDefaultCompanyPolicy,
    leaveCycleType: body.leaveCycleType === "Financial Year" ? "Financial Year" : "Calendar Year",
    approvalFlow: body.approvalFlow || "manager_hr",
    noticePeriodDays: String(noticePeriodDays),
    backdatedLeaveAllowed: body.backdatedLeaveAllowed || "No",
    maximumBackdatedLeaveDays: String(maximumBackdatedLeaveDays),
    ifEmployeePunchesOnApprovedLeave: normalizePunchOnApprovedLeaveAction(body.ifEmployeePunchesOnApprovedLeave),
    sandwichLeave: body.sandwichLeave || "Disabled",
    leaveTypes: trimmedLeaveTypes.map((leaveType) => ({
      ...leaveType,
      accrualRule: normalizeAccrualRule(leaveType.accrualRule),
      annualQuota: String(parseWholeNumberWithinRange(leaveType.annualQuota, 0, MAX_ANNUAL_QUOTA)),
      carryForwardAllowed: leaveType.carryForwardAllowed === "Yes" ? "Yes" : "No",
      maximumCarryForwardDays:
        leaveType.carryForwardAllowed === "Yes"
          ? String(parseWholeNumberWithinRange(leaveType.maximumCarryForwardDays, 0, MAX_CARRY_FORWARD_DAYS))
          : "0",
      carryForwardExpiryDays:
        leaveType.carryForwardAllowed === "Yes"
          ? String(parseWholeNumberWithinRange(leaveType.carryForwardExpiryDays, 0, MAX_CARRY_FORWARD_EXPIRY_DAYS))
          : "0",
    })),
  });
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
  });

  if (saveError || !savedPolicyId) {
    return NextResponse.json({ error: saveError?.message || "Unable to save leave policy definition." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId: savedPolicyId });
}
