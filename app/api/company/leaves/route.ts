import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { leaveRequestFromDb } from "@/lib/companyLeaves";

type Body = {
  employee_id?: string;
  leave_policy_code?: string;
  from_date?: string;
  to_date?: string;
  reason?: string;
};

function diffDaysInclusive(fromDate: string, toDate: string) {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
}

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

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const employeeId = String(body.employee_id || "").trim();
  const leavePolicyCode = String(body.leave_policy_code || "").trim().toUpperCase();
  const fromDate = String(body.from_date || "").trim();
  const toDate = String(body.to_date || "").trim();
  const reason = String(body.reason || "").trim();

  if (!employeeId) return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  if (!leavePolicyCode) return NextResponse.json({ error: "Leave type is required." }, { status: 400 });
  if (!fromDate) return NextResponse.json({ error: "From date is required." }, { status: 400 });
  if (!toDate) return NextResponse.json({ error: "To date is required." }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });
  if (toDate < fromDate) return NextResponse.json({ error: "To date cannot be before from date." }, { status: 400 });

  const days = diffDaysInclusive(fromDate, toDate);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "Leave duration is invalid." }, { status: 400 });
  }

  const [{ data: employee, error: employeeError }, { data: policy, error: policyError }] = await Promise.all([
    context.admin
      .from("employees")
      .select("id,status,full_name,employee_code")
      .eq("company_id", context.companyId)
      .eq("id", employeeId)
      .maybeSingle(),
    context.admin
      .from("company_leave_policies")
      .select("id,name,code,active")
      .eq("company_id", context.companyId)
      .eq("code", leavePolicyCode)
      .maybeSingle(),
  ]);

  if (employeeError || !employee?.id) {
    return NextResponse.json({ error: employeeError?.message || "Employee not found." }, { status: 400 });
  }
  if (employee.status !== "active") {
    return NextResponse.json({ error: "Only active employees can request leave." }, { status: 400 });
  }
  if (policyError || !policy?.id) {
    return NextResponse.json({ error: policyError?.message || "Leave policy not found." }, { status: 400 });
  }
  if (!policy.active) {
    return NextResponse.json({ error: "Selected leave policy is inactive." }, { status: 400 });
  }

  const { data, error } = await context.admin
    .from("employee_leave_requests")
    .insert({
      company_id: context.companyId,
      employee_id: employee.id,
      leave_policy_code: policy.code,
      leave_name_snapshot: policy.name,
      from_date: fromDate,
      to_date: toDate,
      days,
      reason,
      status: "pending",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(
      "id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,reason,status,admin_remark,submitted_at"
      + ",employees(full_name,employee_code)"
    )
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to create leave request." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    row: leaveRequestFromDb(data as unknown as Record<string, unknown>),
  });
}
