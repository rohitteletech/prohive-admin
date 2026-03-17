import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";

type CorrectionBridgePayload = {
  policyId?: string;
  policyName?: string;
  policyCode?: string;
  effectiveFrom?: string;
  nextReviewDate?: string;
  status?: "Draft" | "Active" | "Archived";
  defaultCompanyPolicy?: "Yes" | "No";
  attendanceCorrectionEnabled?: "Yes" | "No";
  missingPunchCorrectionAllowed?: "Yes" | "No";
  latePunchRegularizationAllowed?: "Yes" | "No";
  earlyGoRegularizationAllowed?: "Yes" | "No";
  correctionRequestWindow?: string;
  backdatedCorrectionAllowed?: "Yes" | "No";
  maximumBackdatedDays?: string;
  approvalRequired?: "Yes" | "No";
  approvalFlow?: "Manager Approval" | "HR Approval" | "Manager + HR Approval";
  maximumRequestsPerMonth?: string;
  reasonMandatory?: "Yes" | "No";
};

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

    const config = (correctionPolicy.configJson || {}) as Record<string, unknown>;

    return NextResponse.json({
      policyId: correctionPolicy.id,
      policyName: String(config.policyName || correctionPolicy.policyName || "Standard Correction Policy"),
      policyCode: String(config.policyCode || correctionPolicy.policyCode || "COR-001"),
      effectiveFrom: String(config.effectiveFrom || correctionPolicy.effectiveFrom),
      nextReviewDate: String(config.nextReviewDate || correctionPolicy.nextReviewDate),
      status:
        String(config.status || correctionPolicy.status || "draft").toLowerCase() === "active"
          ? "Active"
          : String(config.status || correctionPolicy.status || "draft").toLowerCase() === "archived"
            ? "Archived"
            : "Draft",
      defaultCompanyPolicy: (config.defaultCompanyPolicy === "No" || correctionPolicy.isDefault === false) ? "No" : "Yes",
      attendanceCorrectionEnabled: config.attendanceCorrectionEnabled === "No" ? "No" : "Yes",
      missingPunchCorrectionAllowed: config.missingPunchCorrectionAllowed === "No" ? "No" : "Yes",
      latePunchRegularizationAllowed: config.latePunchRegularizationAllowed === "No" ? "No" : "Yes",
      earlyGoRegularizationAllowed: config.earlyGoRegularizationAllowed === "No" ? "No" : "Yes",
      correctionRequestWindow: String(config.correctionRequestWindow || "2"),
      backdatedCorrectionAllowed: config.backdatedCorrectionAllowed === "Yes" ? "Yes" : "No",
      maximumBackdatedDays: String(config.maximumBackdatedDays || "2"),
      approvalRequired: config.approvalRequired === "No" ? "No" : "Yes",
      approvalFlow:
        config.approvalFlow === "Manager Approval" || config.approvalFlow === "HR Approval" || config.approvalFlow === "Manager + HR Approval"
          ? config.approvalFlow
          : "Manager + HR Approval",
      maximumRequestsPerMonth: String(config.maximumRequestsPerMonth || "3"),
      reasonMandatory: config.reasonMandatory === "No" ? "No" : "Yes",
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

  const configJson = {
    policyName: body.policyName || policy?.policyName || "Standard Correction Policy",
    policyCode: body.policyCode || policy?.policyCode || "COR-001",
    effectiveFrom: body.effectiveFrom || policy?.effectiveFrom || new Date().toISOString().slice(0, 10),
    nextReviewDate: body.nextReviewDate || policy?.nextReviewDate || new Date().toISOString().slice(0, 10),
    status: (body.status || "Draft").toLowerCase(),
    defaultCompanyPolicy: body.defaultCompanyPolicy || (policy?.isDefault ? "Yes" : "No"),
    attendanceCorrectionEnabled: body.attendanceCorrectionEnabled || "Yes",
    missingPunchCorrectionAllowed: body.missingPunchCorrectionAllowed || "Yes",
    latePunchRegularizationAllowed: body.latePunchRegularizationAllowed || "Yes",
    earlyGoRegularizationAllowed: body.earlyGoRegularizationAllowed || "Yes",
    correctionRequestWindow: body.correctionRequestWindow || "2",
    backdatedCorrectionAllowed: body.backdatedCorrectionAllowed || "No",
    maximumBackdatedDays:
      (body.backdatedCorrectionAllowed || "No") === "Yes"
        ? body.maximumBackdatedDays || "2"
        : "0",
    approvalRequired: body.approvalRequired || "Yes",
    approvalFlow: body.approvalFlow || "Manager + HR Approval",
    maximumRequestsPerMonth: body.maximumRequestsPerMonth || "3",
    reasonMandatory: body.reasonMandatory || "Yes",
  };

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
