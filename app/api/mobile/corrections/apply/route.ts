import { NextRequest, NextResponse } from "next/server";
import { normalizeDateInputToIso, todayISOInIndia } from "@/lib/dateTime";
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

  const correctionDateRaw = String(body.correctionDate || body.correction_date || "").trim();
  const correctionDate = normalizeDateInputToIso(correctionDateRaw);
  const requestedCheckIn = normalizeTime(body.requestedCheckIn || body.requested_check_in);
  const requestedCheckOut = normalizeTime(body.requestedCheckOut || body.requested_check_out);
  const reason = String(body.reason || "").trim();
  const todayIso = todayISOInIndia();

  if (!correctionDateRaw) return NextResponse.json({ error: "Correction date is required." }, { status: 400 });
  if (!correctionDate) return NextResponse.json({ error: "Correction date is invalid. Use MM/DD/YYYY." }, { status: 400 });
  if (correctionDate > todayIso) return NextResponse.json({ error: "Correction date cannot be in the future." }, { status: 400 });
  if (!requestedCheckIn && !requestedCheckOut) {
    return NextResponse.json({ error: "Requested check-in or check-out is required." }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });

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
