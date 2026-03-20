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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
    const correctionPolicy =
      definitions.find((policy) => policy.policyType === "correction" && policy.isDefault) ||
      definitions.find((policy) => policy.policyType === "correction") ||
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
  const defaultCompanyPolicy = normalizeYesNo(body.defaultCompanyPolicy, existingConfig.defaultCompanyPolicy);
  const attendanceCorrectionEnabled = normalizeYesNo(
    body.attendanceCorrectionEnabled,
    existingConfig.attendanceCorrectionEnabled,
  );
  const missingPunchCorrectionAllowed = normalizeYesNo(
    body.missingPunchCorrectionAllowed,
    existingConfig.missingPunchCorrectionAllowed,
  );
  const latePunchRegularizationAllowed = normalizeYesNo(
    body.latePunchRegularizationAllowed,
    existingConfig.latePunchRegularizationAllowed,
  );
  const earlyGoRegularizationAllowed = normalizeYesNo(
    body.earlyGoRegularizationAllowed,
    existingConfig.earlyGoRegularizationAllowed,
  );
  const backdatedCorrectionAllowed = normalizeYesNo(
    body.backdatedCorrectionAllowed,
    existingConfig.backdatedCorrectionAllowed,
  );
  const approvalRequired = normalizeYesNo(body.approvalRequired, existingConfig.approvalRequired);
  const reasonMandatory = normalizeYesNo(body.reasonMandatory, existingConfig.reasonMandatory);

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

  const correctionRequestWindow = parseWholeNumberInRange(
    body.correctionRequestWindow ?? existingConfig.correctionRequestWindow,
    CORRECTION_POLICY_LIMITS.correctionRequestWindow.min,
    CORRECTION_POLICY_LIMITS.correctionRequestWindow.max,
  );
  if (correctionRequestWindow == null) {
    return NextResponse.json({
      error: `Correction Request Window must be a whole number between ${CORRECTION_POLICY_LIMITS.correctionRequestWindow.min} and ${CORRECTION_POLICY_LIMITS.correctionRequestWindow.max}.`,
    }, { status: 400 });
  }

  const maximumBackdatedDays = parseWholeNumberInRange(
    backdatedCorrectionAllowed === "Yes"
      ? body.maximumBackdatedDays ?? existingConfig.maximumBackdatedDays
      : "0",
    CORRECTION_POLICY_LIMITS.maximumBackdatedDays.min,
    CORRECTION_POLICY_LIMITS.maximumBackdatedDays.max,
  );
  if (maximumBackdatedDays == null) {
    return NextResponse.json({
      error: `Maximum Backdated Days must be a whole number between ${CORRECTION_POLICY_LIMITS.maximumBackdatedDays.min} and ${CORRECTION_POLICY_LIMITS.maximumBackdatedDays.max}.`,
    }, { status: 400 });
  }
  if (backdatedCorrectionAllowed === "Yes" && maximumBackdatedDays > correctionRequestWindow) {
    return NextResponse.json({
      error: "Maximum Backdated Days cannot be greater than Correction Request Window.",
    }, { status: 400 });
  }

  const maximumRequestsPerMonth = parseWholeNumberInRange(
    body.maximumRequestsPerMonth ?? existingConfig.maximumRequestsPerMonth,
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
    correctionRequestWindow: String(correctionRequestWindow),
    backdatedCorrectionAllowed,
    maximumBackdatedDays: backdatedCorrectionAllowed === "Yes" ? String(maximumBackdatedDays) : "0",
    approvalRequired,
    approvalFlow: body.approvalFlow ?? existingConfig.approvalFlow,
    maximumRequestsPerMonth: String(maximumRequestsPerMonth),
    reasonMandatory,
  });

  if (configJson.status === "active") {
    const archiveQuery = context.admin
      .from("company_policy_definitions")
      .update({
        status: "archived",
        is_default: false,
      })
      .eq("company_id", context.companyId)
      .eq("policy_type", "correction")
      .eq("status", "active");

    const { error: archiveError } = policy?.id ? await archiveQuery.neq("id", policy.id) : await archiveQuery;
    if (archiveError) {
      return NextResponse.json({ error: archiveError.message || "Unable to archive existing active correction policies." }, { status: 400 });
    }
  }

  if (configJson.defaultCompanyPolicy === "Yes") {
    const { error: clearDefaultError } = await context.admin
      .from("company_policy_definitions")
      .update({ is_default: false })
      .eq("company_id", context.companyId)
      .eq("policy_type", "correction");
    if (clearDefaultError) {
      return NextResponse.json({ error: clearDefaultError.message || "Unable to reset existing default correction policy." }, { status: 400 });
    }
  }

  let policyId = policy?.id || "";
  if (policy) {
    const { error } = await context.admin
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

    if (error) {
      return NextResponse.json({ error: error.message || "Unable to save correction policy definition." }, { status: 400 });
    }
  } else {
    const { data: insertedPolicy, error: insertPolicyError } = await context.admin
      .from("company_policy_definitions")
      .insert({
        company_id: context.companyId,
        policy_type: "correction",
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
      return NextResponse.json({ error: insertPolicyError?.message || "Unable to create correction policy definition." }, { status: 400 });
    }
    policyId = insertedPolicy.id;
  }

  return NextResponse.json({ ok: true, policyId });
}
