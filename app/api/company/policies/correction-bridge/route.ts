import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import {
  correctionPolicyBridgeStateFromStoredConfig,
  CORRECTION_POLICY_LIMITS,
  type CorrectionPolicyBridgeState,
  type CorrectionPolicyStoredStatus,
  type CorrectionPolicyYesNo,
  normalizeCorrectionPolicyConfig,
} from "@/lib/correctionPolicyDefaults";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";
import { todayISOInIndia } from "@/lib/dateTime";

type CorrectionBridgePayload = Partial<CorrectionPolicyBridgeState> & { policyId?: string };

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeStoredStatus(value: unknown, fallback: CorrectionPolicyStoredStatus): CorrectionPolicyStoredStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "archived") return "archived";
  if (normalized === "draft") return "draft";
  return fallback;
}

function normalizeYesNo(value: unknown, fallback: CorrectionPolicyYesNo): CorrectionPolicyYesNo {
  const normalized = String(value ?? "").trim();
  if (normalized === "Yes" || normalized === "No") return normalized;
  return fallback;
}

function parseWholeNumberInRange(value: unknown, min: number, max: number) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function comparePolicyPriority(
  a: { effectiveFrom: string; updatedAt: string; createdAt: string },
  b: { effectiveFrom: string; updatedAt: string; createdAt: string }
) {
  if (a.effectiveFrom !== b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom);
  if (a.updatedAt !== b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
  return b.createdAt.localeCompare(a.createdAt);
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
    const correctionPolicies = definitions.filter((policy) => policy.policyType === "correction");
    const effectiveCorrectionPolicies = correctionPolicies
      .filter((policy) => policy.status === "active")
      .filter((policy) => policy.effectiveFrom <= today)
      .sort(comparePolicyPriority);
    const correctionPolicy =
      effectiveCorrectionPolicies.find((policy) => policy.isDefault) ||
      effectiveCorrectionPolicies[0] ||
      correctionPolicies.find((policy) => policy.isDefault) ||
      [...correctionPolicies].sort(comparePolicyPriority)[0] ||
      null;
    if (!correctionPolicy) {
      return NextResponse.json({ error: "Correction policy definition not found." }, { status: 404 });
    }

    const config = normalizeCorrectionPolicyConfig((correctionPolicy.configJson || {}) as Record<string, unknown>, {
      policyName: correctionPolicy.policyName,
      policyCode: correctionPolicy.policyCode,
      effectiveFrom: correctionPolicy.effectiveFrom,
      nextReviewDate: correctionPolicy.nextReviewDate,
      status: correctionPolicy.status,
      defaultCompanyPolicy: correctionPolicy.isDefault === false ? "No" : "Yes",
    });

    return NextResponse.json({
      policyId: correctionPolicy.id,
      ...correctionPolicyBridgeStateFromStoredConfig(config),
    } satisfies CorrectionBridgePayload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load correction policy bridge." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as CorrectionBridgePayload;
  const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
  const policy = body.policyId
    ? definitions.find((definition) => definition.id === body.policyId && definition.policyType === "correction")
    : null;
  const existingConfig = normalizeCorrectionPolicyConfig((policy?.configJson || {}) as Record<string, unknown>, {
    policyName: String(policy?.policyName || ""),
    policyCode: String(policy?.policyCode || ""),
    effectiveFrom: String(policy?.effectiveFrom || ""),
    nextReviewDate: String(policy?.nextReviewDate || ""),
    status: policy?.status || "draft",
    defaultCompanyPolicy: policy?.isDefault === false ? "No" : "Yes",
  });
  const policyName = String(body.policyName ?? existingConfig.policyName).trim();
  const policyCode = String(body.policyCode ?? existingConfig.policyCode).trim();
  const effectiveFrom = String(body.effectiveFrom ?? existingConfig.effectiveFrom).trim();
  const nextReviewDate = String(body.nextReviewDate ?? existingConfig.nextReviewDate).trim();
  const normalizedStatus = normalizeStoredStatus(body.status ?? existingConfig.status, existingConfig.status);
  const requestedDefaultCompanyPolicy = normalizeYesNo(body.defaultCompanyPolicy, existingConfig.defaultCompanyPolicy);
  const defaultCompanyPolicy =
    normalizedStatus === "active" && requestedDefaultCompanyPolicy === "Yes" ? "Yes" : "No";
  const attendanceCorrectionEnabled = normalizeYesNo(
    body.attendanceCorrectionEnabled,
    existingConfig.attendanceCorrectionEnabled,
  );
  const correctionIsEnabled = attendanceCorrectionEnabled === "Yes";
  const missingPunchCorrectionAllowed = correctionIsEnabled
    ? normalizeYesNo(body.missingPunchCorrectionAllowed, existingConfig.missingPunchCorrectionAllowed)
    : "No";
  const latePunchRegularizationAllowed = correctionIsEnabled
    ? normalizeYesNo(body.latePunchRegularizationAllowed, existingConfig.latePunchRegularizationAllowed)
    : "No";
  const earlyGoRegularizationAllowed = correctionIsEnabled
    ? normalizeYesNo(body.earlyGoRegularizationAllowed, existingConfig.earlyGoRegularizationAllowed)
    : "No";
  const approvalRequired = correctionIsEnabled
    ? normalizeYesNo(body.approvalRequired, existingConfig.approvalRequired)
    : "No";
  const reasonMandatory = correctionIsEnabled
    ? normalizeYesNo(body.reasonMandatory, existingConfig.reasonMandatory)
    : "No";

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

  const maximumBackdatedDays = parseWholeNumberInRange(
    correctionIsEnabled ? body.maximumBackdatedDays ?? existingConfig.maximumBackdatedDays : "0",
    CORRECTION_POLICY_LIMITS.maximumBackdatedDays.min,
    CORRECTION_POLICY_LIMITS.maximumBackdatedDays.max,
  );
  if (maximumBackdatedDays == null) {
    return NextResponse.json({
      error: `Maximum Backdated Days must be a whole number between ${CORRECTION_POLICY_LIMITS.maximumBackdatedDays.min} and ${CORRECTION_POLICY_LIMITS.maximumBackdatedDays.max}.`,
    }, { status: 400 });
  }
  const maximumRequestsPerMonth = parseWholeNumberInRange(
    correctionIsEnabled ? body.maximumRequestsPerMonth ?? existingConfig.maximumRequestsPerMonth : "0",
    CORRECTION_POLICY_LIMITS.maximumRequestsPerMonth.min,
    CORRECTION_POLICY_LIMITS.maximumRequestsPerMonth.max,
  );
  if (maximumRequestsPerMonth == null) {
    return NextResponse.json({
      error: `Maximum Requests Per Month must be a whole number between ${CORRECTION_POLICY_LIMITS.maximumRequestsPerMonth.min} and ${CORRECTION_POLICY_LIMITS.maximumRequestsPerMonth.max}.`,
    }, { status: 400 });
  }

  const configJson = normalizeCorrectionPolicyConfig({
    policyName,
    policyCode,
    effectiveFrom,
    nextReviewDate,
    status: normalizedStatus,
    defaultCompanyPolicy,
    attendanceCorrectionEnabled,
    missingPunchCorrectionAllowed,
    latePunchRegularizationAllowed,
    earlyGoRegularizationAllowed,
    maximumBackdatedDays: String(maximumBackdatedDays),
    approvalRequired,
    approvalFlow: body.approvalFlow ?? existingConfig.approvalFlow,
    maximumRequestsPerMonth: String(maximumRequestsPerMonth),
    reasonMandatory,
  });

  const { data: savedPolicyId, error: saveError } = await context.admin.rpc("save_correction_policy_definition", {
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
    return NextResponse.json({ error: saveError?.message || "Unable to save correction policy definition." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policyId: savedPolicyId });
}
