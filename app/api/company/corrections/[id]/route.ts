import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import {
  correctionTimeToIso,
  dateRangeForIndiaIsoDate,
  expirePendingCorrections,
  isSameIndiaDate,
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

async function upsertPunchEventFromCorrection(args: {
  admin: any;
  companyId: string;
  employeeId: string;
  correctionDate: string;
  requestedTime: string | null;
  punchType: "in" | "out";
  adminEmail: string;
  correctionId: string;
}) {
  const { admin, companyId, employeeId, correctionDate, requestedTime, punchType, adminEmail, correctionId } = args;
  if (!requestedTime) return "";

  const requestedIso = correctionTimeToIso(correctionDate, requestedTime);
  if (!requestedIso) return `Invalid ${punchType === "in" ? "punch in" : "punch out"} time.`;

  const { fromIso, toIso } = dateRangeForIndiaIsoDate(correctionDate);
  const { data: events, error: eventsError } = await admin
    .from("attendance_punch_events")
    .select("id,event_id,punch_type,effective_punch_at,server_received_at,approval_status")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .order("server_received_at", { ascending: true })
    .gte("server_received_at", fromIso)
    .lte("server_received_at", toIso);
  if (eventsError) return eventsError.message || "Unable to apply correction to attendance events.";

  const dayEvents = (events || [])
    .filter((event: any) => event.approval_status !== "rejected")
    .filter((event: any) => {
      const sourceIso = event.effective_punch_at || event.server_received_at || "";
      return sourceIso ? isSameIndiaDate(sourceIso, correctionDate) : false;
    })
    .filter((event: any) => event.punch_type === punchType);

  const existing = punchType === "in" ? dayEvents[0] : dayEvents[dayEvents.length - 1];
  if (existing?.id) {
    const { error: updateError } = await admin
      .from("attendance_punch_events")
      .update({
        effective_punch_at: requestedIso,
        requires_approval: false,
        approval_status: "approved",
        approval_reason_codes: ["ADMIN_CORRECTION_APPROVED"],
      })
      .eq("id", existing.id)
      .eq("company_id", companyId)
      .eq("employee_id", employeeId);
    return updateError ? String(updateError.message || "Unable to update attendance punch event.") : "";
  }

  const [employeeResult, companyResult] = await Promise.all([
    admin
      .from("employees")
      .select("attendance_mode")
      .eq("id", employeeId)
      .eq("company_id", companyId)
      .maybeSingle(),
    admin
      .from("companies")
      .select("office_lat,office_lon,office_radius_m")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  if (employeeResult.error || !employeeResult.data) {
    return employeeResult.error?.message || "Employee snapshot missing for correction apply.";
  }
  if (companyResult.error || !companyResult.data) {
    return companyResult.error?.message || "Company snapshot missing for correction apply.";
  }

  const ms = new Date(requestedIso).getTime();
  const { error: insertError } = await admin.from("attendance_punch_events").insert({
    company_id: companyId,
    employee_id: employeeId,
    event_id: crypto.randomUUID(),
    source: "mobile",
    punch_type: punchType,
    attendance_mode_snapshot: employeeResult.data.attendance_mode === "office_only" ? "office_only" : "field_staff",
    office_lat_snapshot: companyResult.data.office_lat,
    office_lon_snapshot: companyResult.data.office_lon,
    office_radius_m_snapshot: companyResult.data.office_radius_m,
    lat: 0,
    lon: 0,
    address_text: "Admin attendance correction",
    accuracy_m: 0,
    distance_from_office_m: null,
    is_offline: false,
    device_time_ms: Number.isFinite(ms) ? ms : 0,
    device_time_at: requestedIso,
    estimated_time_ms: null,
    estimated_time_at: null,
    trusted_anchor_time_ms: null,
    trusted_anchor_time_at: null,
    trusted_anchor_elapsed_ms: 0,
    elapsed_ms: 0,
    clock_drift_ms: null,
    server_received_at: new Date().toISOString(),
    effective_punch_at: requestedIso,
    requires_approval: false,
    approval_status: "approved",
    approval_reason_codes: ["ADMIN_CORRECTION_APPROVED"],
    raw_payload: {
      source: "attendance_correction",
      correction_id: correctionId,
      applied_by: adminEmail,
    },
  });
  return insertError ? String(insertError.message || "Unable to create corrected attendance punch event.") : "";
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
      adminEmail: context.adminEmail,
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
      adminEmail: context.adminEmail,
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
