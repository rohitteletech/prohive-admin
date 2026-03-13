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

  if (typeof body.isActive === "boolean") payload.is_active = body.isActive;
  if (body.effectiveTo === null) {
    payload.effective_to = null;
  } else if (typeof body.effectiveTo === "string" && body.effectiveTo.trim()) {
    payload.effective_to = body.effectiveTo.trim();
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No assignment fields provided." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("company_policy_assignments")
    .update(payload)
    .eq("company_id", context.companyId)
    .eq("id", id)
    .select("id,company_id,policy_type,policy_id,assignment_level,target_id,effective_from,effective_to,is_active,created_by,created_at,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to update policy assignment." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, assignment: data });
}
