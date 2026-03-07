import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { claimRowFromDb, ClaimType } from "@/lib/companyClaims";
import { normalizeDateInputToIso, todayISOInIndia } from "@/lib/dateTime";

type Body = {
  employee_id?: string;
  employeeId?: string;
  from_date?: string;
  fromDate?: string;
  to_date?: string;
  toDate?: string;
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

function isoDateToUtcMs(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    return Number.NaN;
  }
  return ms;
}

function diffDaysInclusive(fromIso: string, toIso: string) {
  const fromMs = isoDateToUtcMs(fromIso);
  const toMs = isoDateToUtcMs(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return Number.NaN;
  return Math.floor((toMs - fromMs) / 86400000) + 1;
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
      "id,employee_id,from_date,to_date,days,claim_type,claim_type_other_text,amount,reason,attachment_url,status,admin_remark,submitted_at"
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
  const fromDateRaw = String(body.from_date || body.fromDate || "").trim();
  const toDateRaw = String(body.to_date || body.toDate || "").trim();
  const fromDate = normalizeDateInputToIso(fromDateRaw);
  const toDate = normalizeDateInputToIso(toDateRaw);
  const todayIso = todayISOInIndia();
  const claimType = String(body.claim_type || body.claimType || "").trim().toLowerCase();
  const claimTypeOtherText = normalizeOptional(body.claim_type_other_text || body.claimTypeOther);
  const amount = Number(body.amount || 0);
  const reason = String(body.reason || "").trim();
  const attachmentUrl = normalizeOptional(body.attachment_url || body.attachmentUrl);

  if (!employeeId) return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  if (!fromDateRaw) return NextResponse.json({ error: "From date is required." }, { status: 400 });
  if (!toDateRaw) return NextResponse.json({ error: "To date is required." }, { status: 400 });
  if (!fromDate) return NextResponse.json({ error: "From date is invalid. Use DD/MM/YYYY." }, { status: 400 });
  if (!toDate) return NextResponse.json({ error: "To date is invalid. Use DD/MM/YYYY." }, { status: 400 });
  if (fromDate > todayIso || toDate > todayIso) {
    return NextResponse.json({ error: "Claim dates cannot be in the future." }, { status: 400 });
  }
  const days = diffDaysInclusive(fromDate, toDate);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "To date cannot be before from date." }, { status: 400 });
  }
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
      from_date: fromDate,
      to_date: toDate,
      days,
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
      "id,employee_id,from_date,to_date,days,claim_type,claim_type_other_text,amount,reason,attachment_url,status,admin_remark,submitted_at"
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

