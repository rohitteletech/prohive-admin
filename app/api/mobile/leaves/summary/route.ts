import { NextRequest, NextResponse } from "next/server";
import { formatDisplayDate, formatDisplayDateTime, todayISOInIndia } from "@/lib/dateTime";
import { resolveLeavePolicyRuntime, resolveLeaveTypesRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import { getMobileSessionContext } from "@/lib/mobileSession";
import { computeLeaveEntitlement, fetchApprovedAttendanceDatesForYear, fetchLeaveOverrideDays, fetchLeaveUsageForYear, normalizeAccrualMode, restoredDaysForLeaveRequest, roundLeaveDays } from "@/lib/leaveAccrual";

const FIXED_MAX_BACKDATED_LEAVE_DAYS = 5;

function yearRange(year: number) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  };
}

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

  const currentYear = Number(todayISOInIndia().slice(0, 4));
  const today = todayISOInIndia();
  const range = yearRange(currentYear);
  const policyContext = await resolvePoliciesForEmployee(
    session.admin,
    session.employee.company_id,
    session.employee.id,
    today,
    ["leave"],
  );
  const leavePolicyRuntime = resolveLeavePolicyRuntime(policyContext.resolved.leave);
  const resolvedLeaveTypes = resolveLeaveTypesRuntime(policyContext.resolved.leave);

  const [policyResult, requestResult, holidayResult] = await Promise.all([
    session.admin
      .from("company_leave_policies")
      .select("id,name,code,annual_quota,carry_forward,accrual_mode,encashable,active")
      .eq("company_id", session.employee.company_id)
      .eq("active", true)
      .order("name", { ascending: true }),
    session.admin
      .from("employee_leave_requests")
      .select("id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,paid_days,unpaid_days,leave_mode,reason,status,admin_remark,submitted_at")
      .eq("company_id", session.employee.company_id)
      .eq("employee_id", session.employee.id)
      .gte("from_date", range.start)
      .lte("from_date", range.end)
      .order("submitted_at", { ascending: false }),
    session.admin
      .from("company_holidays")
      .select("id,holiday_date,name,type")
      .eq("company_id", session.employee.company_id)
      .gte("holiday_date", range.start)
      .lte("holiday_date", range.end)
      .order("holiday_date", { ascending: true }),
  ]);

  if (policyResult.error) {
    return NextResponse.json({ error: policyResult.error.message || "Unable to load leave policies." }, { status: 400 });
  }
  if (requestResult.error) {
    return NextResponse.json({ error: requestResult.error.message || "Unable to load leave requests." }, { status: 400 });
  }
  if (holidayResult.error) {
    return NextResponse.json({ error: holidayResult.error.message || "Unable to load holidays." }, { status: 400 });
  }

  const requests = (requestResult.data || []) as Array<{
    id: string;
    leave_policy_code: string;
    leave_name_snapshot: string;
    from_date: string;
    to_date: string;
    days: number;
    paid_days?: number | null;
    unpaid_days?: number | null;
    leave_mode?: "paid" | "unpaid" | "mixed" | null;
    reason: string;
    status: "pending" | "pending_manager" | "pending_hr" | "approved" | "rejected";
    admin_remark: string | null;
    submitted_at: string;
  }>;

  const legacyPolicyRows = (policyResult.data || []) as Array<{
    id: string;
    name: string;
    code: string;
    annual_quota: number;
    carry_forward: number;
    accrual_mode: "monthly" | "upfront" | null;
    encashable: boolean;
    active: boolean;
  }>;
  const policyRows = resolvedLeaveTypes.length > 0
    ? resolvedLeaveTypes.map((leaveType) => ({
        id: leaveType.id,
        name: leaveType.name,
        code: leaveType.code,
        annual_quota: leaveType.annualQuota,
        carry_forward:
          leaveType.carryForwardAllowed
            ? Math.max(0, Math.round(Number(leaveType.maximumCarryForwardDays || 0)))
            : 0,
        accrual_mode: leaveType.accrualRule === "Yearly Upfront" ? "upfront" : "monthly",
        encashable: false,
        active: true,
      }))
    : legacyPolicyRows;

  const usageEntries = await Promise.all(
    policyRows.map(async (row) => {
      const code = String(row.code || "");
      const result = await fetchLeaveUsageForYear({
        admin: session.admin,
        companyId: session.employee.company_id,
        employeeId: session.employee.id,
        leavePolicyCode: code,
        year: currentYear,
      });
      return [code, result] as const;
    }),
  );
  const usageError = usageEntries.find(([, result]) => result.error)?.[1].error;
  if (usageError) {
    return NextResponse.json({ error: usageError }, { status: 400 });
  }
  const usageByCode = new Map(
    usageEntries.map(([code, result]) => [code, { approvedUsed: result.approvedUsed, pendingUsed: result.pendingUsed }]),
  );

  const overrideEntries = await Promise.all(
    policyRows.map(async (row) => {
      const result = await fetchLeaveOverrideDays({
        admin: session.admin,
        companyId: session.employee.company_id,
        employeeId: session.employee.id,
        leavePolicyCode: String(row.code || ""),
        year: currentYear,
      });
      return [String(row.code || ""), result] as const;
    })
  );
  const overrideByCode = new Map(overrideEntries.map(([code, result]) => [code, result.overrideDays]));
  const attendanceDatesResult = await fetchApprovedAttendanceDatesForYear({
    admin: session.admin,
    companyId: session.employee.company_id,
    employeeId: session.employee.id,
    year: currentYear,
  });
  if (attendanceDatesResult.error) {
    return NextResponse.json({ error: attendanceDatesResult.error }, { status: 400 });
  }

  return NextResponse.json({
    employee: {
      id: session.employee.id,
      employeeCode: session.employee.employee_code,
      fullName: session.employee.full_name,
    },
    settings: {
      backdatedLeaveAllowed: leavePolicyRuntime.backdatedLeaveAllowed,
      maxBackdatedLeaveDays: FIXED_MAX_BACKDATED_LEAVE_DAYS,
    },
    balances: policyRows.map((row) => {
      const code = String(row.code || "");
      const usage = usageByCode.get(code) || { approvedUsed: 0, pendingUsed: 0 };
      const annualQuota = Number(row.annual_quota || 0);
      const carryForward = Number(row.carry_forward || 0);
      const accrualMode = normalizeAccrualMode(row.accrual_mode);
      const overrideDays = Number(overrideByCode.get(code) || 0);
      const entitlement = computeLeaveEntitlement({
        annualQuota,
        carryForward,
        accrualMode,
        overrideDays,
        asOfIsoDate: today,
      });
      const total = roundLeaveDays(annualQuota + carryForward + overrideDays);
      const remaining = Math.max(roundLeaveDays(entitlement.accruedTotal - usage.approvedUsed), 0);
      const remainingAfterPending = Math.max(roundLeaveDays(entitlement.accruedTotal - usage.approvedUsed - usage.pendingUsed), 0);
      return {
        id: row.id,
        code,
        name: String(row.name || ""),
        annualQuota,
        carryForward,
        accrualMode,
        accrued: entitlement.accruedTotal,
        annualAccrued: entitlement.annualAccrued,
        overrideDays,
        total,
        approvedUsed: usage.approvedUsed,
        pendingUsed: usage.pendingUsed,
        remaining,
        remainingAfterPending,
        encashable: Boolean(row.encashable),
      };
    }),
    requests: requests.map((row) => ({
      restoredDays: restoredDaysForLeaveRequest(row, attendanceDatesResult.approvedAttendanceDates),
      attendanceOverrideApplied: restoredDaysForLeaveRequest(row, attendanceDatesResult.approvedAttendanceDates) > 0,
      id: row.id,
      leavePolicyCode: row.leave_policy_code,
      leaveName: row.leave_name_snapshot,
      fromDate: formatDisplayDate(row.from_date),
      toDate: formatDisplayDate(row.to_date),
      days: Number(row.days || 0),
      paidDays: Number((row.paid_days ?? row.days) || 0),
      unpaidDays: Number(row.unpaid_days || 0),
      leaveMode: String(row.leave_mode || "paid"),
      reason: row.reason,
      status: row.status,
      adminRemark: row.admin_remark,
      submittedAt: formatDisplayDateTime(row.submitted_at),
    })),
    holidays: (holidayResult.data || []).map((row) => ({
      id: row.id,
      date: formatDisplayDate(row.holiday_date),
      name: row.name,
      type: row.type,
    })),
  });
}
