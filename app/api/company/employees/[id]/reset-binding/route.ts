import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";

export async function POST(req: NextRequest, contextArg: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await contextArg.params;
  if (!id) {
    return NextResponse.json({ error: "Employee id is required." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("employees")
    .update({
      bound_device_id: null,
      bound_device_name: null,
      bound_app_version: null,
      bound_device_at: null,
      mobile_last_login_at: null,
    })
    .eq("company_id", context.companyId)
    .eq("id", id)
    .select("id,employee_code")
    .maybeSingle();

  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message || "Unable to reset device binding." }, { status: 400 });
  }

  console.info("device_binding_reset", {
    companyAdmin: context.adminEmail,
    companyId: context.companyId,
    employeeId: data.id,
    employeeCode: data.employee_code,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, id: data.id });
}
