import { NextRequest, NextResponse } from "next/server";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dateTime";
import { getMobileSessionContext } from "@/lib/mobileSession";

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

  const { data, error } = await session.admin
    .from("employee_claim_requests")
    .select("id,claim_date,claim_type,claim_type_other_text,amount,reason,attachment_url,status,admin_remark,submitted_at")
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .order("submitted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load claims." }, { status: 400 });
  }

  return NextResponse.json({
    employee: {
      id: session.employee.id,
      employeeCode: session.employee.employee_code,
      fullName: session.employee.full_name,
    },
    requests: (data || []).map((row) => ({
      id: row.id,
      claimDate: formatDisplayDate(row.claim_date),
      claimType: row.claim_type,
      claimTypeOther: row.claim_type_other_text,
      amount: Number(row.amount || 0),
      reason: row.reason,
      attachmentUrl: row.attachment_url,
      status: row.status,
      adminRemark: row.admin_remark,
      submittedAt: formatDisplayDateTime(row.submitted_at),
    })),
  });
}
