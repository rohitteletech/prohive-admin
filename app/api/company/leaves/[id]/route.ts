import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { todayISOInIndia } from "@/lib/dateTime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import { resolveHolidayPolicyRuntime, resolveLeavePolicyRuntime, resolveLeaveTypesRuntime } from "@/lib/companyPolicyRuntime";
import {
  computeLeaveEntitlement,
  fetchCompOffEarnedDays,
  fetchLeaveCarryForwardDays,
  getLeaveCycleBounds,
  fetchLeaveOverrideDays,
  fetchLeaveUsageForCycle,
  normalizeAccrualMode,
  roundLeaveDays,
} from "@/lib/leaveAccrual";
import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";

type Body = {
  status?: "approved" | "rejected";
  admin_remark?: string;
};

type LeaveWorkflowStatus = "pending" | "pending_manager" | "pending_hr" | "approved" | "rejected";
const VIRTUAL_COMP_OFF_CODE = "COMP-OFF";

function normalizeOptional(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

async function findApprovedOverlap(params: {
  admin: any;
  companyId: string;
  employeeId: string;
  fromDate: string;
  toDate: string;
  excludeId: string;
}) {
  const { data, error } = await params.admin
    .from("employee_leave_requests")
    .select("id,from_date,to_date")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("status", "approved")
    .neq("id", params.excludeId)
    .lte("from_date", params.toDate)
    .gte("to_date", params.fromDate)
    .order("from_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { row: null, error: error.message || "Unable to verify approved leave overlap." };
  return { row: data, error: null as string | null };
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
    .select("id,employee_id,leave_policy_code,days,paid_days,status,from_date,to_date,approval_flow_snapshot")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .maybeSingle();
  if (requestError || !requestRow?.id) {
    return NextResponse.json({ error: requestError?.message || "Leave request not found." }, { status: 404 });
  }
  if (
    requestRow.status !== "pending" &&
    requestRow.status !== "pending_manager" &&
    requestRow.status !== "pending_hr"
  ) {
    return NextResponse.json({ error: "Only pending leave requests can be updated." }, { status: 400 });
  }

  const approvalFlow =
    requestRow.approval_flow_snapshot === "hr" || requestRow.approval_flow_snapshot === "manager"
      ? requestRow.approval_flow_snapshot
      : "manager_hr";
  const requiresTwoStage = approvalFlow === "manager_hr";
  const currentStage =
    requestRow.status === "pending_hr"
      ? "hr"
      : requestRow.status === "pending_manager"
        ? "manager"
        : approvalFlow === "hr"
          ? "hr"
          : "manager";

  if (currentStage === "manager") {
    return NextResponse.json(
      { error: "Manager approval is required first. HR/Admin cannot complete the manager stage." },
      { status: 403 },
    );
  }

  const nextApprovedStatus: LeaveWorkflowStatus = "approved";

  if (body.status === "approved" && nextApprovedStatus === "approved") {
    const policyContext = await resolvePoliciesForEmployee(
      context.admin,
      context.companyId,
      requestRow.employee_id,
      String(requestRow.from_date || todayISOInIndia()),
      ["leave", "holiday_weekoff"],
    );
    const resolvedHoliday = resolveHolidayPolicyRuntime(policyContext.resolved.holiday_weekoff);
    const resolvedLeave = resolveLeavePolicyRuntime(policyContext.resolved.leave);
    const resolvedLeaveTypes = resolveLeaveTypesRuntime(policyContext.resolved.leave);
    const currentCycleBounds = getLeaveCycleBounds(String(requestRow.from_date || todayISOInIndia()), resolvedLeave.leaveCycleType);
    const previousCycleEndDate = new Date(`${currentCycleBounds.start}T00:00:00.000Z`);
    previousCycleEndDate.setUTCDate(previousCycleEndDate.getUTCDate() - 1);
    const previousCycleEnd = previousCycleEndDate.toISOString().slice(0, 10);
    const previousPolicyContext = await resolvePoliciesForEmployee(
      context.admin,
      context.companyId,
      requestRow.employee_id,
      previousCycleEnd,
      ["leave"],
    );
    const previousResolvedLeaveTypes = resolveLeaveTypesRuntime(previousPolicyContext.resolved.leave);
    const [usageResult, overrideResult, overlapResult] = await Promise.all([
      fetchLeaveUsageForCycle({
        admin: context.admin,
        companyId: context.companyId,
        employeeId: requestRow.employee_id,
        leavePolicyCode: requestRow.leave_policy_code,
        asOfIsoDate: String(requestRow.from_date || todayISOInIndia()),
        leaveCycleType: resolvedLeave.leaveCycleType,
      }),
      fetchLeaveOverrideDays({
        admin: context.admin,
        companyId: context.companyId,
        employeeId: requestRow.employee_id,
        leavePolicyCode: requestRow.leave_policy_code,
        asOfIsoDate: String(requestRow.from_date || todayISOInIndia()),
        leaveCycleType: resolvedLeave.leaveCycleType,
      }),
      findApprovedOverlap({
        admin: context.admin,
        companyId: context.companyId,
        employeeId: requestRow.employee_id,
        fromDate: String(requestRow.from_date || ""),
        toDate: String(requestRow.to_date || ""),
        excludeId: requestRow.id,
      }),
    ]);

    if (usageResult.error) return NextResponse.json({ error: usageResult.error }, { status: 400 });
    if (overrideResult.error) return NextResponse.json({ error: overrideResult.error }, { status: 400 });
    if (overlapResult.error) return NextResponse.json({ error: overlapResult.error }, { status: 400 });
    if (overlapResult.row?.id) {
      return NextResponse.json({
        error: `Approval blocked. Leave already approved for these dates (${overlapResult.row.from_date} to ${overlapResult.row.to_date}).`,
      }, { status: 400 });
    }

    let accruedTotal = 0;

    if (requestRow.leave_policy_code === VIRTUAL_COMP_OFF_CODE) {
      const compOffEntitlement = await fetchCompOffEarnedDays({
        admin: context.admin,
        companyId: context.companyId,
        employeeId: requestRow.employee_id,
        asOfIsoDate: todayISOInIndia(),
        weeklyOffPolicy: resolvedHoliday.weeklyOffPolicy,
        holidayWorkedStatus: resolvedHoliday.holidayWorkedStatus as NonWorkingDayTreatment,
        weeklyOffWorkedStatus: resolvedHoliday.weeklyOffWorkedStatus as NonWorkingDayTreatment,
        compOffValidityDays: resolvedHoliday.compOffValidityDays,
        leaveCycleType: resolvedLeave.leaveCycleType,
      });
      if (compOffEntitlement.error) {
        return NextResponse.json({ error: compOffEntitlement.error }, { status: 400 });
      }
      accruedTotal = roundLeaveDays(compOffEntitlement.earnedDays + overrideResult.overrideDays);
    } else {
      const { data: policyRow, error: policyError } = await context.admin
        .from("company_leave_policies")
        .select("annual_quota,carry_forward,accrual_mode,active")
        .eq("company_id", context.companyId)
        .eq("code", requestRow.leave_policy_code)
        .maybeSingle();

      if (policyError || !policyRow?.active) {
        return NextResponse.json({ error: policyError?.message || "Leave policy is inactive or missing." }, { status: 400 });
      }

      const resolvedLeaveType = resolvedLeaveTypes.find((row) => row.code === requestRow.leave_policy_code);
      const carryForwardResult = await fetchLeaveCarryForwardDays({
        admin: context.admin,
        companyId: context.companyId,
        employeeId: requestRow.employee_id,
        leavePolicyCode: requestRow.leave_policy_code,
        previousCycleLeavePolicyCode:
          previousResolvedLeaveTypes.find((row) => row.code === requestRow.leave_policy_code)?.code || "",
        previousCyclePolicyEffectiveFrom: previousPolicyContext.resolved.leave?.effectiveFrom,
        previousCycleAnnualQuota:
          previousResolvedLeaveTypes.find((row) => row.code === requestRow.leave_policy_code)?.annualQuota ?? 0,
        previousCycleAccrualMode:
          previousResolvedLeaveTypes.find((row) => row.code === requestRow.leave_policy_code)?.accrualRule === "Yearly Upfront"
            ? "upfront"
            : "monthly",
        carryForwardAllowed: Number(policyRow.carry_forward || 0) > 0,
        maximumCarryForwardDays: Number(policyRow.carry_forward || 0),
        carryForwardExpiryDays: resolvedLeaveType?.carryForwardExpiryDays || 0,
        asOfIsoDate: String(requestRow.from_date || todayISOInIndia()),
        leaveCycleType: resolvedLeave.leaveCycleType,
      });
      if (carryForwardResult.error) {
        return NextResponse.json({ error: carryForwardResult.error }, { status: 400 });
      }

      const entitlement = computeLeaveEntitlement({
        annualQuota: Number(policyRow.annual_quota || 0),
        carryForward: carryForwardResult.effectiveDays,
        accrualMode: normalizeAccrualMode(policyRow.accrual_mode),
        overrideDays: overrideResult.overrideDays,
        asOfIsoDate: todayISOInIndia(),
        leaveCycleType: resolvedLeave.leaveCycleType,
      });
      accruedTotal = entitlement.accruedTotal;
    }

    // This request already exists in pending bucket, remove it once before approve validation.
    const approvingPaidDays = Number((requestRow.paid_days ?? requestRow.days) || 0);
    if (approvingPaidDays > 0) {
      const pendingExcludingCurrent = Math.max(roundLeaveDays(usageResult.pendingUsed - approvingPaidDays), 0);
      const availableForApproval = Math.max(
        roundLeaveDays(accruedTotal - usageResult.approvedUsed - pendingExcludingCurrent),
        0
      );
      if (approvingPaidDays > availableForApproval) {
        return NextResponse.json({
          error: `Approval blocked. Only ${availableForApproval} paid day(s) currently available in accrued balance.`,
        }, { status: 400 });
      }
    }
  }

  const { data, error } = await context.admin
    .from("employee_leave_requests")
    .update({
      status: body.status === "approved" ? nextApprovedStatus : body.status,
      admin_remark: normalizeOptional(body.admin_remark),
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.adminEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", context.companyId)
    .eq("id", id)
    .in("status", ["pending", "pending_manager", "pending_hr"])
    .select("id,status")
    .maybeSingle();

  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message || "Unable to update leave request." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
