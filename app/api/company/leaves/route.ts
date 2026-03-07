import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { leaveRequestFromDb } from "@/lib/companyLeaves";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.admin
    .from("employee_leave_requests")
    .select(
      "id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,reason,status,admin_remark,submitted_at"
      + ",employees(full_name,employee_code)"
    )
    .eq("company_id", context.companyId)
    .order("submitted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load leave requests." }, { status: 400 });
  }

  return NextResponse.json({
    rows: Array.isArray(data) ? data.map((row) => leaveRequestFromDb(row as unknown as Record<string, unknown>)) : [],
  });
}
