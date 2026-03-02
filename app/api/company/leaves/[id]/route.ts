import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";

type Body = {
  status?: "approved" | "rejected";
  admin_remark?: string;
};

function normalizeOptional(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

export async function PUT(req: NextRequest, contextArg: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await contextArg.params;
  const body = (await req.json().catch(() => ({}))) as Body;

  if (!id) {
    return NextResponse.json({ error: "Leave request id is required." }, { status: 400 });
  }
  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "Status must be approved or rejected." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("employee_leave_requests")
    .update({
      status: body.status,
      admin_remark: normalizeOptional(body.admin_remark),
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.adminEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", context.companyId)
    .eq("id", id)
    .select("id,status")
    .maybeSingle();

  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message || "Unable to update leave request." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
