import { NextRequest, NextResponse } from "next/server";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dateTime";
import { expirePendingCorrections } from "@/lib/attendanceCorrections";
import { getMobileSessionContext } from "@/lib/mobileSession";

function displayTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hhmm = raw.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : "";
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    companyId?: string;
    deviceId?: string;
  };

  const session = await getMobileSessionContext({
    employeeId: body.employeeId,
    companyId: body.companyId,
    deviceId: body.deviceId,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }
  await expirePendingCorrections(session.admin, session.employee.company_id);

  const { data, error } = await session.admin
    .from("employee_attendance_corrections")
    .select("id,correction_date,requested_check_in,requested_check_out,reason,status,admin_remark,submitted_at")
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .order("submitted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load correction requests." }, { status: 400 });
  }

  return NextResponse.json({
    employee: {
      id: session.employee.id,
      employeeCode: session.employee.employee_code,
      fullName: session.employee.full_name,
    },
    requests: (data || []).map((row) => ({
      id: row.id,
      correctionDate: formatDisplayDate(row.correction_date),
      requestedCheckIn: displayTime(row.requested_check_in),
      requestedCheckOut: displayTime(row.requested_check_out),
      reason: row.reason,
      status: row.status,
      adminRemark: row.admin_remark,
      submittedAt: formatDisplayDateTime(row.submitted_at),
    })),
  });
}
