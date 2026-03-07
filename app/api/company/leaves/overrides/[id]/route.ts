import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";

export async function DELETE(req: NextRequest, contextArg: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await contextArg.params;
  if (!id) return NextResponse.json({ error: "Override id is required." }, { status: 400 });

  const { data: existing, error: fetchError } = await context.admin
    .from("employee_leave_balance_overrides")
    .select("id,employee_id,leave_policy_code,year,extra_days,reason")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !existing?.id) {
    return NextResponse.json({ error: fetchError?.message || "Leave override not found." }, { status: 404 });
  }

  const { error: deleteError } = await context.admin
    .from("employee_leave_balance_overrides")
    .delete()
    .eq("company_id", context.companyId)
    .eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Unable to delete leave override." }, { status: 400 });
  }

  await context.admin.from("employee_leave_balance_override_audit_logs").insert({
    override_id: existing.id,
    company_id: context.companyId,
    employee_id: existing.employee_id,
    leave_policy_code: existing.leave_policy_code,
    year: existing.year,
    action: "deleted",
    old_extra_days: Number(existing.extra_days || 0),
    new_extra_days: null,
    reason: existing.reason || null,
    changed_by: context.adminEmail,
    changed_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, id });
}
