import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";

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
