import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import {
  expirePendingCorrections,
  upsertPunchEventFromCorrection,
} from "@/lib/attendanceCorrections";

type Body = {
  status?: "approved" | "rejected";
  admin_remark?: string;
};

type CorrectionRecord = {
  id: string;
  company_id: string;
  employee_id: string;
  correction_date: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  admin_remark: string | null;
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
  const adminRemark = normalizeOptional(body.admin_remark);
  if (!id) return NextResponse.json({ error: "Correction request id is required." }, { status: 400 });
  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "Status must be approved or rejected." }, { status: 400 });
  }
  if (!adminRemark) {
    return NextResponse.json({ error: "Admin remark is required." }, { status: 400 });
  }

  await expirePendingCorrections(context.admin, context.companyId);

  const { data: existing, error: existingError } = await context.admin
    .from("employee_attendance_corrections")
    .select("id,company_id,employee_id,correction_date,requested_check_in,requested_check_out,reason,status,admin_remark")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .maybeSingle();

  const row = existing as CorrectionRecord | null;
  if (existingError || !row?.id) {
    return NextResponse.json({ error: existingError?.message || "Correction request not found." }, { status: 404 });
  }
  if (row.status !== "pending") {
    return NextResponse.json({ error: "Only pending requests can be updated." }, { status: 409 });
  }

  if (body.status === "approved") {
    const inApplyError = await upsertPunchEventFromCorrection({
      admin: context.admin,
      companyId: context.companyId,
      employeeId: row.employee_id,
      correctionDate: row.correction_date,
      requestedTime: row.requested_check_in,
      punchType: "in",
      performedBy: context.adminEmail,
      correctionId: row.id,
    });
    if (inApplyError) return NextResponse.json({ error: inApplyError }, { status: 400 });

    const outApplyError = await upsertPunchEventFromCorrection({
      admin: context.admin,
      companyId: context.companyId,
      employeeId: row.employee_id,
      correctionDate: row.correction_date,
      requestedTime: row.requested_check_out,
      punchType: "out",
      performedBy: context.adminEmail,
      correctionId: row.id,
    });
    if (outApplyError) return NextResponse.json({ error: outApplyError }, { status: 400 });
  }

  const reviewedAt = new Date().toISOString();
  const { data, error } = await context.admin
    .from("employee_attendance_corrections")
    .update({
      status: body.status,
      admin_remark: adminRemark,
      reviewed_at: reviewedAt,
      reviewed_by: context.adminEmail,
      updated_at: reviewedAt,
    })
    .eq("company_id", context.companyId)
    .eq("id", id)
    .eq("status", "pending")
    .select("id,status")
    .maybeSingle();

  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message || "Correction request is already processed." }, { status: 409 });
  }

  await context.admin.from("employee_attendance_correction_audit_logs").insert({
    correction_id: row.id,
    company_id: row.company_id,
    employee_id: row.employee_id,
    action: "reviewed",
    old_status: row.status,
    new_status: body.status,
    old_requested_check_in: row.requested_check_in,
    new_requested_check_in: row.requested_check_in,
    old_requested_check_out: row.requested_check_out,
    new_requested_check_out: row.requested_check_out,
    reason_snapshot: row.reason,
    performed_by: context.adminEmail,
    performed_role: "company_admin",
    remark: adminRemark,
    created_at: reviewedAt,
  });

  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
