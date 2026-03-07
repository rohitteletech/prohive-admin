import { NextRequest, NextResponse } from "next/server";
import { normalizeDateInputToIso } from "@/lib/dateTime";
import {
  expirePendingCorrections,
  monthRangeForIsoDate,
  validateCorrectionReason,
  validateCorrectionWindow,
} from "@/lib/attendanceCorrections";
import { getMobileSessionContext } from "@/lib/mobileSession";

function normalizeTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return "";
  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    employee_id?: string;
    companyId?: string;
    company_id?: string;
    deviceId?: string;
    device_id?: string;
    correctionDate?: string;
    correction_date?: string;
    requestedCheckIn?: string;
    requested_check_in?: string;
    requestedCheckOut?: string;
    requested_check_out?: string;
    reason?: string;
  };

  const session = await getMobileSessionContext({
    employeeId: body.employeeId || body.employee_id,
    companyId: body.companyId || body.company_id,
    deviceId: body.deviceId || body.device_id,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  await expirePendingCorrections(session.admin, session.employee.company_id);

  const correctionDateRaw = String(body.correctionDate || body.correction_date || "").trim();
  const correctionDate = normalizeDateInputToIso(correctionDateRaw);
  const requestedCheckIn = normalizeTime(body.requestedCheckIn || body.requested_check_in);
  const requestedCheckOut = normalizeTime(body.requestedCheckOut || body.requested_check_out);
  const reason = String(body.reason || "").trim();

  if (!correctionDateRaw) return NextResponse.json({ error: "Correction date is required." }, { status: 400 });
  if (!correctionDate) return NextResponse.json({ error: "Correction date is invalid. Use MM/DD/YYYY." }, { status: 400 });
  const windowError = validateCorrectionWindow(correctionDate);
  if (windowError) return NextResponse.json({ error: windowError }, { status: 400 });
  if (!requestedCheckIn && !requestedCheckOut) {
    return NextResponse.json({ error: "Requested check-in or check-out is required." }, { status: 400 });
  }
  if (requestedCheckIn && requestedCheckOut && requestedCheckOut <= requestedCheckIn) {
    return NextResponse.json({ error: "Punch out time must be later than punch in time." }, { status: 400 });
  }
  const reasonError = validateCorrectionReason(reason);
  if (reasonError) return NextResponse.json({ error: reasonError }, { status: 400 });

  const { data: pendingDuplicate, error: duplicateError } = await session.admin
    .from("employee_attendance_corrections")
    .select("id")
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .eq("correction_date", correctionDate)
    .eq("status", "pending")
    .maybeSingle();
  if (duplicateError) {
    return NextResponse.json({ error: duplicateError.message || "Unable to validate duplicate request." }, { status: 400 });
  }
  if (pendingDuplicate?.id) {
    return NextResponse.json({ error: "A pending correction request already exists for this date." }, { status: 409 });
  }

  const monthRange = monthRangeForIsoDate(correctionDate);
  const { count, error: countError } = await session.admin
    .from("employee_attendance_corrections")
    .select("id", { count: "exact", head: true })
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .gte("correction_date", monthRange.start)
    .lte("correction_date", monthRange.end);
  if (countError) {
    return NextResponse.json({ error: countError.message || "Unable to validate monthly limit." }, { status: 400 });
  }
  if (Number(count || 0) >= 5) {
    await session.admin.from("employee_attendance_correction_audit_logs").insert({
      correction_id: null,
      company_id: session.employee.company_id,
      employee_id: session.employee.id,
      action: "blocked_monthly_limit",
      old_status: null,
      new_status: null,
      old_requested_check_in: null,
      new_requested_check_in: requestedCheckIn || null,
      old_requested_check_out: null,
      new_requested_check_out: requestedCheckOut || null,
      reason_snapshot: reason,
      performed_by: session.employee.id,
      performed_role: "employee",
      remark: "Monthly limit exceeded (5).",
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({ error: "Monthly correction limit reached (5). Contact company admin." }, { status: 429 });
  }

  const { data, error } = await session.admin
    .from("employee_attendance_corrections")
    .insert({
      company_id: session.employee.company_id,
      employee_id: session.employee.id,
      correction_date: correctionDate,
      requested_check_in: requestedCheckIn || null,
      requested_check_out: requestedCheckOut || null,
      reason,
      status: "pending",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id,correction_date,requested_check_in,requested_check_out,reason,status,admin_remark,submitted_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to submit correction request." }, { status: 400 });
  }

  await session.admin.from("employee_attendance_correction_audit_logs").insert({
    correction_id: data.id,
    company_id: session.employee.company_id,
    employee_id: session.employee.id,
    action: "submitted",
    old_status: null,
    new_status: "pending",
    old_requested_check_in: null,
    new_requested_check_in: requestedCheckIn || null,
    old_requested_check_out: null,
    new_requested_check_out: requestedCheckOut || null,
    reason_snapshot: reason,
    performed_by: session.employee.id,
    performed_role: "employee",
    remark: null,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    request: {
      id: data.id,
      correctionDate: data.correction_date,
      requestedCheckIn: data.requested_check_in,
      requestedCheckOut: data.requested_check_out,
      reason: data.reason,
      status: data.status,
      adminRemark: data.admin_remark,
      submittedAt: data.submitted_at,
    },
  });
}
