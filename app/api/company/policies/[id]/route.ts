import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { todayISOInIndia } from "@/lib/dateTime";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  if (typeof body.policyName === "string" && body.policyName.trim()) payload.policy_name = body.policyName.trim();
  if (typeof body.policyCode === "string" && body.policyCode.trim()) payload.policy_code = body.policyCode.trim();
  if (typeof body.status === "string" && ["draft", "active", "archived"].includes(body.status.toLowerCase())) {
    payload.status = body.status.toLowerCase();
  }
  if (typeof body.effectiveFrom === "string" && body.effectiveFrom.trim()) payload.effective_from = body.effectiveFrom.trim();
  if (typeof body.nextReviewDate === "string" && body.nextReviewDate.trim()) payload.next_review_date = body.nextReviewDate.trim();
  if (typeof body.isDefault === "boolean") payload.is_default = body.isDefault;
  if (typeof body.configJson === "object" && body.configJson) payload.config_json = body.configJson;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No policy fields provided." }, { status: 400 });
  }

  const { data: targetPolicy, error: targetPolicyError } = await context.admin
    .from("company_policy_definitions")
    .select("id,policy_type")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .maybeSingle();

  if (targetPolicyError || !targetPolicy) {
    return NextResponse.json({ error: targetPolicyError?.message || "Policy not found." }, { status: 404 });
  }

  if (targetPolicy.policy_type === "attendance") {
    return NextResponse.json(
      { error: "Attendance policy updates must use the attendance policy bridge." },
      { status: 400 }
    );
  }

  const { data, error } = await context.admin
    .from("company_policy_definitions")
    .update(payload)
    .eq("company_id", context.companyId)
    .eq("id", id)
    .select("id,company_id,policy_type,policy_name,policy_code,status,is_default,effective_from,next_review_date,config_json,created_by,created_at,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to update policy definition." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policy: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await params;

  const { data: policy, error: policyError } = await context.admin
    .from("company_policy_definitions")
    .select("id,status,effective_from")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .maybeSingle();

  if (policyError || !policy) {
    return NextResponse.json({ error: policyError?.message || "Policy not found." }, { status: 404 });
  }

  const isCurrentlyEffectiveActive =
    String(policy.status || "").toLowerCase() === "active" &&
    String(policy.effective_from || "").trim() <= todayISOInIndia();

  if (isCurrentlyEffectiveActive) {
    return NextResponse.json({ error: "Active policy cannot be deleted. Archive or replace it first." }, { status: 400 });
  }

  const { count, error: assignmentError } = await context.admin
    .from("company_policy_assignments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", context.companyId)
    .eq("policy_id", id)
    .eq("is_active", true);

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message || "Unable to verify policy assignments." }, { status: 400 });
  }

  if ((count || 0) > 0) {
    return NextResponse.json({ error: "This policy is currently assigned to workforce. Reassign it before deletion." }, { status: 400 });
  }

  const { error: deleteError } = await context.admin
    .from("company_policy_definitions")
    .delete()
    .eq("company_id", context.companyId)
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Unable to delete policy." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
