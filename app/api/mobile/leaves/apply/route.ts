import { NextRequest, NextResponse } from "next/server";
import { getMobileSessionContext } from "@/lib/mobileSession";

function diffDaysInclusive(fromDate: string, toDate: string) {
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    employeeId?: string;
    companyId?: string;
    deviceId?: string;
    leavePolicyCode?: string;
    fromDate?: string;
    toDate?: string;
    reason?: string;
  };

  const session = await getMobileSessionContext({
    employeeId: body.employeeId,
    companyId: body.companyId,
    deviceId: body.deviceId,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const leavePolicyCode = String(body.leavePolicyCode || "").trim().toUpperCase();
  const fromDate = String(body.fromDate || "").trim();
  const toDate = String(body.toDate || "").trim();
  const reason = String(body.reason || "").trim();

  if (!leavePolicyCode) return NextResponse.json({ error: "Leave type is required." }, { status: 400 });
  if (!fromDate) return NextResponse.json({ error: "From date is required." }, { status: 400 });
  if (!toDate) return NextResponse.json({ error: "To date is required." }, { status: 400 });
  if (toDate < fromDate) return NextResponse.json({ error: "To date cannot be before from date." }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });

  const days = diffDaysInclusive(fromDate, toDate);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "Leave duration is invalid." }, { status: 400 });
  }

  const { data: policy, error: policyError } = await session.admin
    .from("company_leave_policies")
    .select("id,name,code,annual_quota,carry_forward,active")
    .eq("company_id", session.employee.company_id)
    .eq("code", leavePolicyCode)
    .maybeSingle();

  if (policyError || !policy?.id) {
    return NextResponse.json({ error: policyError?.message || "Leave policy not found." }, { status: 400 });
  }
  if (!policy.active) {
    return NextResponse.json({ error: "Selected leave type is inactive." }, { status: 400 });
  }

  const currentYear = new Date(fromDate).getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const { data: approvedRows, error: approvedError } = await session.admin
    .from("employee_leave_requests")
    .select("days")
    .eq("company_id", session.employee.company_id)
    .eq("employee_id", session.employee.id)
    .eq("leave_policy_code", leavePolicyCode)
    .eq("status", "approved")
    .gte("from_date", yearStart)
    .lte("from_date", yearEnd);

  if (approvedError) {
    return NextResponse.json({ error: approvedError.message || "Unable to validate leave balance." }, { status: 400 });
  }

  const approvedUsed = ((approvedRows || []) as Array<{ days: number }>).reduce((acc, row) => acc + Number(row.days || 0), 0);
  const total = Number(policy.annual_quota || 0) + Number(policy.carry_forward || 0);
  const remaining = Math.max(total - approvedUsed, 0);
  if (days > remaining) {
    return NextResponse.json({ error: `Only ${remaining} day(s) available for ${policy.name}.` }, { status: 400 });
  }

  const { data, error } = await session.admin
    .from("employee_leave_requests")
    .insert({
      company_id: session.employee.company_id,
      employee_id: session.employee.id,
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
    .select("id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,reason,status,admin_remark,submitted_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Unable to submit leave request." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    request: {
      id: data.id,
      leavePolicyCode: data.leave_policy_code,
      leaveName: data.leave_name_snapshot,
      fromDate: data.from_date,
      toDate: data.to_date,
      days: Number(data.days || 0),
      reason: data.reason,
      status: data.status,
      adminRemark: data.admin_remark,
      submittedAt: data.submitted_at,
    },
  });
}
