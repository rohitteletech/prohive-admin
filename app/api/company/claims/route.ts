import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { claimRowFromDb } from "@/lib/companyClaims";

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
