import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { ensureCompanyPolicyDefinitions, validatePolicyType } from "@/lib/companyPoliciesServer";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  try {
    const policies = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
    const searchType = req.nextUrl.searchParams.get("policy_type");
    const filtered = searchType ? policies.filter((policy) => policy.policyType === searchType) : policies;
    return NextResponse.json({ policies: filtered });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load policies." }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const policyType = validatePolicyType(body.policyType);
  const policyName = String(body.policyName || "").trim();
  const policyCode = String(body.policyCode || "").trim();
  const status = String(body.status || "").trim().toLowerCase();
  const effectiveFrom = String(body.effectiveFrom || "").trim();
  const nextReviewDate = String(body.nextReviewDate || "").trim();

  if (!policyType || !policyName || !policyCode || !effectiveFrom || !nextReviewDate) {
    return NextResponse.json({ error: "Policy type, name, code, effective date, and next review date are required." }, { status: 400 });
  }
  if (!["draft", "active", "archived"].includes(status)) {
    return NextResponse.json({ error: "Invalid policy status." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("company_policy_definitions")
    .insert({
      company_id: context.companyId,
      policy_type: policyType,
      policy_name: policyName,
      policy_code: policyCode,
      status,
      is_default: body.isDefault === true,
      effective_from: effectiveFrom,
      next_review_date: nextReviewDate,
      config_json: typeof body.configJson === "object" && body.configJson ? body.configJson : {},
      created_by: context.adminEmail,
    })
    .select("id,company_id,policy_type,policy_name,policy_code,status,is_default,effective_from,next_review_date,config_json,created_by,created_at,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to create policy definition." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, policy: data });
}
