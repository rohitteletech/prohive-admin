import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { claimRowFromDb, ClaimType } from "@/lib/companyClaims";
import { normalizeDateInputToIso } from "@/lib/dateTime";

type Body = {
  employee_id?: string;
  employeeId?: string;
  claim_date?: string;
  claimDate?: string;
  claim_type?: ClaimType;
  claimType?: ClaimType;
  claim_type_other_text?: string;
  claimTypeOther?: string;
  amount?: number;
  reason?: string;
  attachment_url?: string;
  attachmentUrl?: string;
};

function normalizeOptional(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.admin
    .from("employee_claim_requests")
    .select(
      "id,employee_id,claim_date,claim_type,claim_type_other_text,amount,reason,attachment_url,status,admin_remark,submitted_at"
      + ",employees(full_name,employee_code)"
    )
    .eq("company_id", context.companyId)
    .order("submitted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load claims." }, { status: 400 });
  }

  return NextResponse.json({
    rows: Array.isArray(data) ? data.map((row) => claimRowFromDb(row as unknown as Record<string, unknown>)) : [],
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const employeeId = String(body.employee_id || body.employeeId || "").trim();
  const claimDateRaw = String(body.claim_date || body.claimDate || "").trim();
  const claimDate = normalizeDateInputToIso(claimDateRaw);
  const claimType = String(body.claim_type || body.claimType || "").trim().toLowerCase();
  const claimTypeOtherText = normalizeOptional(body.claim_type_other_text || body.claimTypeOther);
  const amount = Number(body.amount || 0);
  const reason = String(body.reason || "").trim();
  const attachmentUrl = normalizeOptional(body.attachment_url || body.attachmentUrl);

  if (!employeeId) return NextResponse.json({ error: "Employee is required." }, { status: 400 });
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

  const { data: employee, error: employeeError } = await context.admin
    .from("employees")
    .select("id,status")
    .eq("company_id", context.companyId)
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError || !employee?.id) {
    return NextResponse.json({ error: employeeError?.message || "Employee not found." }, { status: 400 });
  }
  if (employee.status !== "active") {
    return NextResponse.json({ error: "Only active employees can submit claims." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("employee_claim_requests")
    .insert({
      company_id: context.companyId,
      employee_id: employee.id,
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
    .select(
      "id,employee_id,claim_date,claim_type,claim_type_other_text,amount,reason,attachment_url,status,admin_remark,submitted_at"
      + ",employees(full_name,employee_code)"
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to create claim." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    row: claimRowFromDb(data as unknown as Record<string, unknown>),
  });
}
