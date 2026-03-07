import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { todayISOInIndia } from "@/lib/dateTime";
import { computeLeaveEntitlement, fetchLeaveOverrideDays, fetchLeaveUsageForYear, normalizeAccrualMode, roundLeaveDays } from "@/lib/leaveAccrual";

type Body = {
  status?: "approved" | "rejected";
  admin_remark?: string;
};

function normalizeOptional(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

export async function PUT(req: NextRequest, contextArg: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await contextArg.params;
  const body = (await req.json().catch(() => ({}))) as Body;

  if (!id) {
    return NextResponse.json({ error: "Leave request id is required." }, { status: 400 });
  }
  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "Status must be approved or rejected." }, { status: 400 });
  }

  const { data: requestRow, error: requestError } = await context.admin
    .from("employee_leave_requests")
    .select("id,employee_id,leave_policy_code,days,status,from_date")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .maybeSingle();
  if (requestError || !requestRow?.id) {
    return NextResponse.json({ error: requestError?.message || "Leave request not found." }, { status: 404 });
  }
  if (requestRow.status !== "pending") {
    return NextResponse.json({ error: "Only pending leave requests can be updated." }, { status: 400 });
  }

  if (body.status === "approved") {
    const year = Number(String(requestRow.from_date || "").slice(0, 4) || todayISOInIndia().slice(0, 4));
    const [policyResult, usageResult, overrideResult] = await Promise.all([
      context.admin
        .from("company_leave_policies")
        .select("annual_quota,carry_forward,accrual_mode,active")
        .eq("company_id", context.companyId)
        .eq("code", requestRow.leave_policy_code)
        .maybeSingle(),
      fetchLeaveUsageForYear({
        admin: context.admin,
        companyId: context.companyId,
        employeeId: requestRow.employee_id,
        leavePolicyCode: requestRow.leave_policy_code,
        year,
      }),
      fetchLeaveOverrideDays({
        admin: context.admin,
        companyId: context.companyId,
        employeeId: requestRow.employee_id,
        leavePolicyCode: requestRow.leave_policy_code,
        year,
      }),
    ]);

    if (policyResult.error || !policyResult.data?.active) {
      return NextResponse.json({ error: policyResult.error?.message || "Leave policy is inactive or missing." }, { status: 400 });
    }
    if (usageResult.error) return NextResponse.json({ error: usageResult.error }, { status: 400 });
    if (overrideResult.error) return NextResponse.json({ error: overrideResult.error }, { status: 400 });

    const entitlement = computeLeaveEntitlement({
      annualQuota: Number(policyResult.data.annual_quota || 0),
      carryForward: Number(policyResult.data.carry_forward || 0),
      accrualMode: normalizeAccrualMode(policyResult.data.accrual_mode),
      overrideDays: overrideResult.overrideDays,
      asOfIsoDate: todayISOInIndia(),
    });

    // This request already exists in pending bucket, remove it once before approve validation.
    const pendingExcludingCurrent = Math.max(roundLeaveDays(usageResult.pendingUsed - Number(requestRow.days || 0)), 0);
    const approvingDays = Number(requestRow.days || 0);
    const availableForApproval = Math.max(
      roundLeaveDays(entitlement.accruedTotal - usageResult.approvedUsed - pendingExcludingCurrent),
      0
    );
    if (approvingDays > availableForApproval) {
      return NextResponse.json({
        error: `Approval blocked. Only ${availableForApproval} day(s) currently available in accrued balance.`,
      }, { status: 400 });
    }
  }

  const { data, error } = await context.admin
    .from("employee_leave_requests")
    .update({
      status: body.status,
      admin_remark: normalizeOptional(body.admin_remark),
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.adminEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", context.companyId)
    .eq("id", id)
    .select("id,status")
    .maybeSingle();

  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message || "Unable to update leave request." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
