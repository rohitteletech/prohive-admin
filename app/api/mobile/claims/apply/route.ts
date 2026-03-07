import { NextRequest, NextResponse } from "next/server";
import { getMobileSessionContext } from "@/lib/mobileSession";
import { normalizeDateInputToIso } from "@/lib/dateTime";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    employee_id?: string;
    companyId?: string;
    company_id?: string;
    deviceId?: string;
    device_id?: string;
    claimDate?: string;
    claim_date?: string;
    claimType?: "travel" | "meal" | "misc" | "other";
    claim_type?: "travel" | "meal" | "misc" | "other";
    claimTypeOther?: string;
    claim_type_other_text?: string;
    amount?: number;
    reason?: string;
    attachmentUrl?: string;
    attachment_url?: string;
  };

  const session = await getMobileSessionContext({
    employeeId: body.employeeId || body.employee_id,
    companyId: body.companyId || body.company_id,
    deviceId: body.deviceId || body.device_id,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const claimDateRaw = String(body.claimDate || body.claim_date || "").trim();
  const claimDate = normalizeDateInputToIso(claimDateRaw);
  const claimType = String(body.claimType || body.claim_type || "").trim().toLowerCase();
  const claimTypeOtherText = String(body.claimTypeOther || body.claim_type_other_text || "").trim();
  const amount = Number(body.amount || 0);
  const reason = String(body.reason || "").trim();
  const attachmentUrl = String(body.attachmentUrl || body.attachment_url || "").trim() || null;

  if (!claimDateRaw) return NextResponse.json({ error: "Claim date is required." }, { status: 400 });
  if (!claimDate) return NextResponse.json({ error: "Claim date is invalid. Use MM/DD/YYYY." }, { status: 400 });
  if (claimType !== "travel" && claimType !== "meal" && claimType !== "misc" && claimType !== "other") {
    return NextResponse.json({ error: "Claim type is invalid." }, { status: 400 });
  }
  if (claimType === "other" && !claimTypeOtherText) {
    return NextResponse.json({ error: "Other claim type detail is required." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });

  const { data, error } = await session.admin
    .from("employee_claim_requests")
    .insert({
      company_id: session.employee.company_id,
      employee_id: session.employee.id,
      claim_date: claimDate,
      claim_type: claimType,
      claim_type_other_text: claimType === "other" ? claimTypeOtherText : null,
      amount,
      reason,
      attachment_url: attachmentUrl,
      status: "pending",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id,claim_date,claim_type,claim_type_other_text,amount,reason,attachment_url,status,admin_remark,submitted_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to submit claim." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    request: {
      id: data.id,
      claimDate: data.claim_date,
      claimType: data.claim_type,
      claimTypeOther: data.claim_type_other_text,
      amount: Number(data.amount || 0),
      reason: data.reason,
      attachmentUrl: data.attachment_url,
      status: data.status,
      adminRemark: data.admin_remark,
      submittedAt: data.submitted_at,
    },
  });
}
