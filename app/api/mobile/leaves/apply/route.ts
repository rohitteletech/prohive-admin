import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISOInIndia } from "@/lib/dateTime";
import { resolveHolidayPolicyRuntime, resolveLeavePolicyRuntime, resolveLeaveTypesRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import {
  computeLeaveEntitlement,
  fetchCompOffEarnedDays,
  fetchLeaveCarryForwardDays,
  fetchLeaveOverrideDays,
  fetchLeaveUsageForCycle,
  getLeaveCycleBounds,
  normalizeAccrualMode,
  roundLeaveDays,
} from "@/lib/leaveAccrual";
import { getMobileSessionContext } from "@/lib/mobileSession";
import type { NonWorkingDayTreatment } from "@/lib/attendancePolicy";

const FIXED_MAX_BACKDATED_LEAVE_DAYS = 5;
const VIRTUAL_COMP_OFF_CODE = "COMP-OFF";

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

function diffDaysInclusive(fromDate: string, toDate: string) {
  const start = isoDateToUtcMs(fromDate);
  const end = isoDateToUtcMs(toDate);
  const diff = end - start;
  return Math.floor(diff / 86400000) + 1;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const start = isoDateToUtcMs(isoDate);
  if (!Number.isFinite(start)) return "";
  const shifted = new Date(start + days * 86400000);
  return shifted.toISOString().slice(0, 10);
}

async function findApprovedOverlap(params: {
  admin: SupabaseClient;
  companyId: string;
  employeeId: string;
  fromDate: string;
  toDate: string;
}) {
  const { data, error } = await params.admin
    .from("employee_leave_requests")
    .select("id,from_date,to_date,leave_name_snapshot")
    .eq("company_id", params.companyId)
    .eq("employee_id", params.employeeId)
    .eq("status", "approved")
    .lte("from_date", params.toDate)
    .gte("to_date", params.fromDate)
    .order("from_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { row: null, error: error.message || "Unable to verify approved leave overlap." };
  return { row: data, error: null as string | null };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionToken?: string;
    fromDate?: string;
    toDate?: string;
    isHalfDay?: boolean;
    leavePolicyCode?: string;
    reason?: string;
  };

  const session = await getMobileSessionContext({
    sessionToken: body.sessionToken,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const fromDate = String(body.fromDate || "").trim();
  const toDate = String(body.toDate || "").trim();
  const isHalfDay = body.isHalfDay === true;
  const selectedLeavePolicyCode = String(body.leavePolicyCode || "").trim().toUpperCase();
  const reason = String(body.reason || "").trim();

  if (!fromDate) return NextResponse.json({ error: "From date is required." }, { status: 400 });
  if (!toDate) return NextResponse.json({ error: "To date is required." }, { status: 400 });
  if (toDate < fromDate) return NextResponse.json({ error: "To date cannot be before from date." }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });

  if (isHalfDay && fromDate !== toDate) {
    return NextResponse.json({ error: "Half day leave can only be applied for a single date." }, { status: 400 });
  }

  const days = isHalfDay ? 0.5 : diffDaysInclusive(fromDate, toDate);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "Leave duration is invalid." }, { status: 400 });
  }

  const overlapResult = await findApprovedOverlap({
    admin: session.admin,
    companyId: session.employee.company_id,
    employeeId: session.employee.id,
    fromDate,
    toDate,
  });
  if (overlapResult.error) {
    return NextResponse.json({ error: overlapResult.error }, { status: 400 });
  }
  if (overlapResult.row?.id) {
    return NextResponse.json({
      error: `Leave already approved for these dates (${overlapResult.row.from_date} to ${overlapResult.row.to_date}).`,
    }, { status: 400 });
  }

  const policyContext = await resolvePoliciesForEmployee(
    session.admin,
    session.employee.company_id,
    session.employee.id,
    fromDate,
    ["leave", "holiday_weekoff"],
  );
  const leavePolicyRuntime = resolveLeavePolicyRuntime(policyContext.resolved.leave);
  const resolvedLeaveTypes = resolveLeaveTypesRuntime(policyContext.resolved.leave);
  const resolvedHoliday = resolveHolidayPolicyRuntime(policyContext.resolved.holiday_weekoff);
  const currentCycleBounds = getLeaveCycleBounds(fromDate, leavePolicyRuntime.leaveCycleType);
  const previousCycleEndDate = new Date(`${currentCycleBounds.start}T00:00:00.000Z`);
  previousCycleEndDate.setUTCDate(previousCycleEndDate.getUTCDate() - 1);
  const previousCycleEnd = previousCycleEndDate.toISOString().slice(0, 10);
  const previousPolicyContext = await resolvePoliciesForEmployee(
    session.admin,
    session.employee.company_id,
    session.employee.id,
    previousCycleEnd,
    ["leave"],
  );
  const previousResolvedLeaveTypes = resolveLeaveTypesRuntime(previousPolicyContext.resolved.leave);
  const fromCycle = getLeaveCycleBounds(fromDate, leavePolicyRuntime.leaveCycleType);
  const toCycle = getLeaveCycleBounds(toDate, leavePolicyRuntime.leaveCycleType);
  if (fromCycle.start !== toCycle.start || fromCycle.end !== toCycle.end) {
    return NextResponse.json({ error: "Cross-cycle leave request is not allowed. Submit cycle-wise requests." }, { status: 400 });
  }
  const todayIso = todayISOInIndia();
  const initialStatus =
    leavePolicyRuntime.approvalFlow === "hr"
      ? "pending_hr"
      : leavePolicyRuntime.approvalFlow === "manager"
        ? "pending_manager"
        : "pending_manager";

  if (fromDate < todayIso && !leavePolicyRuntime.backdatedLeaveAllowed) {
    return NextResponse.json(
      { error: "Backdated leave is not allowed under your current leave policy." },
      { status: 400 },
    );
  }

  if (fromDate < todayIso && leavePolicyRuntime.backdatedLeaveAllowed) {
    const earliestBackdatedStartDate = addDaysToIsoDate(todayIso, -FIXED_MAX_BACKDATED_LEAVE_DAYS);
    if (earliestBackdatedStartDate && fromDate < earliestBackdatedStartDate) {
      return NextResponse.json(
        { error: `Backdated leave can only be applied for the last ${FIXED_MAX_BACKDATED_LEAVE_DAYS} day(s).` },
        { status: 400 },
      );
    }
  }

  const earliestAllowedStartDate = addDaysToIsoDate(todayIso, leavePolicyRuntime.noticePeriodDays);
  if (earliestAllowedStartDate && fromDate < earliestAllowedStartDate) {
    return NextResponse.json(
      {
        error:
          leavePolicyRuntime.noticePeriodDays === 0
            ? "Leave can only be applied from today onward."
            : `Leave must be applied at least ${leavePolicyRuntime.noticePeriodDays} day(s) in advance.`,
      },
      { status: 400 },
    );
  }

  const { data: policyRows, error: policyError } = await session.admin
    .from("company_leave_policies")
    .select("id,name,code,annual_quota,carry_forward,accrual_mode,active")
    .eq("company_id", session.employee.company_id)
    .eq("active", true)
    .order("name", { ascending: true });

  if (policyError) {
    return NextResponse.json({ error: policyError.message || "Unable to load leave policies." }, { status: 400 });
  }
  const policies: Array<{
    id: string;
    name: string;
    code: string;
    halfDayAllowed?: boolean;
    annual_quota: number;
    carry_forward: number;
    accrual_mode: "upfront" | "monthly";
    active: boolean;
  }> = resolvedLeaveTypes.length > 0
    ? resolvedLeaveTypes.map((leaveType) => ({
        id: leaveType.id,
        name: leaveType.name,
        code: leaveType.code,
        halfDayAllowed: leaveType.halfDayAllowed,
        annual_quota: leaveType.annualQuota,
        carry_forward:
          leaveType.carryForwardAllowed
            ? Math.max(0, Math.round(Number(leaveType.maximumCarryForwardDays || 0)))
            : 0,
        accrual_mode: leaveType.accrualRule === "Yearly Upfront" ? "upfront" : "monthly",
        active: true,
      }))
    : Array.isArray(policyRows)
      ? policyRows.map((policy) => ({
          id: String(policy.id || ""),
          name: String(policy.name || ""),
          code: String(policy.code || ""),
          annual_quota: Number(policy.annual_quota || 0),
          carry_forward: Number(policy.carry_forward || 0),
          accrual_mode: policy.accrual_mode === "upfront" ? "upfront" : "monthly",
          active: Boolean(policy.active),
        }))
      : [];
  if (policies.length === 0) {
    return NextResponse.json({ error: "No active leave policy configured. Contact admin." }, { status: 400 });
  }

  const eligiblePolicies = isHalfDay
    ? policies.filter((policy) => policy.halfDayAllowed !== false)
    : policies;

  if (eligiblePolicies.length === 0) {
    return NextResponse.json({ error: "No leave type allows half day leave under your assigned policy." }, { status: 400 });
  }

  const requestedPolicies = selectedLeavePolicyCode
    ? eligiblePolicies.filter((policy) => String(policy.code || "").trim().toUpperCase() === selectedLeavePolicyCode)
    : eligiblePolicies;

  if (selectedLeavePolicyCode && requestedPolicies.length === 0 && selectedLeavePolicyCode !== VIRTUAL_COMP_OFF_CODE) {
    return NextResponse.json(
      {
        error: isHalfDay
          ? "Selected leave type does not allow half day leave under your assigned policy."
          : "Selected leave type is not available under your assigned policy.",
      },
      { status: 400 },
    );
  }

  if (!selectedLeavePolicyCode && requestedPolicies.length > 1) {
    return NextResponse.json({ error: "Please select a leave type before applying." }, { status: 400 });
  }

  const selectingCompOff = selectedLeavePolicyCode === VIRTUAL_COMP_OFF_CODE;

  const availabilityByPolicy = await Promise.all(
    requestedPolicies.map(async (policy) => {
      const leavePolicyCode = String(policy.code || "");
      const [usageResult, overrideResult] = await Promise.all([
        fetchLeaveUsageForCycle({
          admin: session.admin,
          companyId: session.employee.company_id,
          employeeId: session.employee.id,
          leavePolicyCode,
          asOfIsoDate: fromDate,
          leaveCycleType: leavePolicyRuntime.leaveCycleType,
        }),
        fetchLeaveOverrideDays({
          admin: session.admin,
          companyId: session.employee.company_id,
          employeeId: session.employee.id,
          leavePolicyCode,
          asOfIsoDate: fromDate,
          leaveCycleType: leavePolicyRuntime.leaveCycleType,
        }),
      ]);

      if (usageResult.error) {
        return { policy, availableNow: 0, error: usageResult.error };
      }
      if (overrideResult.error) {
        return { policy, availableNow: 0, error: overrideResult.error };
      }
      const carryForwardResult = await fetchLeaveCarryForwardDays({
        admin: session.admin,
        companyId: session.employee.company_id,
        employeeId: session.employee.id,
        leavePolicyCode,
        previousCycleLeavePolicyCode:
          previousResolvedLeaveTypes.find((leaveType) => leaveType.code === leavePolicyCode)?.code || "",
        previousCyclePolicyEffectiveFrom: previousPolicyContext.resolved.leave?.effectiveFrom,
        previousCycleAnnualQuota:
          previousResolvedLeaveTypes.find((leaveType) => leaveType.code === leavePolicyCode)?.annualQuota ?? 0,
        previousCycleAccrualMode:
          previousResolvedLeaveTypes.find((leaveType) => leaveType.code === leavePolicyCode)?.accrualRule === "Yearly Upfront"
            ? "upfront"
            : "monthly",
        carryForwardAllowed: Number(policy.carry_forward || 0) > 0,
        maximumCarryForwardDays: Number(policy.carry_forward || 0),
        carryForwardExpiryDays:
          resolvedLeaveTypes.find((leaveType) => leaveType.code === leavePolicyCode)?.carryForwardExpiryDays || 0,
        asOfIsoDate: fromDate,
        leaveCycleType: leavePolicyRuntime.leaveCycleType,
      });
      if (carryForwardResult.error) {
        return { policy, availableNow: 0, error: carryForwardResult.error };
      }

      const entitlement = computeLeaveEntitlement({
        annualQuota: Number(policy.annual_quota || 0),
        carryForward: carryForwardResult.effectiveDays,
        accrualMode: normalizeAccrualMode(policy.accrual_mode),
        overrideDays: overrideResult.overrideDays,
        asOfIsoDate: todayIso,
        leaveCycleType: leavePolicyRuntime.leaveCycleType,
      });
      const availableNow = Math.max(roundLeaveDays(entitlement.accruedTotal - usageResult.approvedUsed - usageResult.pendingUsed), 0);
      return { policy, availableNow, error: null as string | null };
    })
  );

  if (selectingCompOff) {
    const [compOffEntitlement, compOffUsage] = await Promise.all([
      fetchCompOffEarnedDays({
        admin: session.admin,
        companyId: session.employee.company_id,
        employeeId: session.employee.id,
        asOfIsoDate: fromDate,
        weeklyOffPolicy: resolvedHoliday.weeklyOffPolicy,
        holidayWorkedStatus: resolvedHoliday.holidayWorkedStatus as NonWorkingDayTreatment,
        weeklyOffWorkedStatus: resolvedHoliday.weeklyOffWorkedStatus as NonWorkingDayTreatment,
        compOffValidityDays: resolvedHoliday.compOffValidityDays,
        leaveCycleType: leavePolicyRuntime.leaveCycleType,
      }),
      fetchLeaveUsageForCycle({
        admin: session.admin,
        companyId: session.employee.company_id,
        employeeId: session.employee.id,
        leavePolicyCode: VIRTUAL_COMP_OFF_CODE,
        asOfIsoDate: fromDate,
        leaveCycleType: leavePolicyRuntime.leaveCycleType,
      }),
    ]);
    const compOffOverride = await fetchLeaveOverrideDays({
      admin: session.admin,
      companyId: session.employee.company_id,
      employeeId: session.employee.id,
      leavePolicyCode: VIRTUAL_COMP_OFF_CODE,
      asOfIsoDate: fromDate,
      leaveCycleType: leavePolicyRuntime.leaveCycleType,
    });

    if (compOffEntitlement.error) {
      return NextResponse.json({ error: compOffEntitlement.error }, { status: 400 });
    }
    if (compOffUsage.error) {
      return NextResponse.json({ error: compOffUsage.error }, { status: 400 });
    }
    if (compOffOverride.error) {
      return NextResponse.json({ error: compOffOverride.error }, { status: 400 });
    }
    if (isHalfDay) {
      return NextResponse.json({ error: "Half day is not allowed for Comp Off leave." }, { status: 400 });
    }

    const availableNow = Math.max(
      roundLeaveDays(compOffEntitlement.earnedDays + compOffOverride.overrideDays - compOffUsage.approvedUsed - compOffUsage.pendingUsed),
      0,
    );
    availabilityByPolicy.unshift({
      policy: {
        id: "virtual-comp-off",
        name: "Comp Off",
        code: VIRTUAL_COMP_OFF_CODE,
        annual_quota: 0,
        carry_forward: 0,
        accrual_mode: "upfront" as const,
        active: true,
      },
      availableNow,
      error: null as string | null,
    });
  }

  const failed = availabilityByPolicy.find((item) => item.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error }, { status: 400 });
  }

  const selected =
    availabilityByPolicy.find((item) => String(item.policy.code || "").trim().toUpperCase() === selectedLeavePolicyCode) ||
    availabilityByPolicy[0] ||
    null;
  if (!selected) {
    return NextResponse.json({ error: "Unable to determine leave balance." }, { status: 400 });
  }
  if (selectingCompOff && days > selected.availableNow) {
    return NextResponse.json({ error: "Requested Comp Off exceeds available earned balance." }, { status: 400 });
  }
  const paidDays = Math.max(Math.min(days, selected.availableNow), 0);
  const unpaidDays = Math.max(roundLeaveDays(days - paidDays), 0);
  const leaveMode = unpaidDays <= 0 ? "paid" : paidDays <= 0 ? "unpaid" : "mixed";

  const { data, error } = await session.admin
    .from("employee_leave_requests")
    .insert({
      company_id: session.employee.company_id,
      employee_id: session.employee.id,
      leave_policy_code: selected.policy.code,
      leave_name_snapshot: selected.policy.name,
      from_date: fromDate,
      to_date: toDate,
      days,
      paid_days: paidDays,
      unpaid_days: unpaidDays,
      leave_mode: leaveMode,
      reason,
      status: initialStatus,
      approval_flow_snapshot: leavePolicyRuntime.approvalFlow,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,paid_days,unpaid_days,leave_mode,reason,status,admin_remark,submitted_at")
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
      paidDays: Number((data.paid_days ?? data.days) || 0),
      unpaidDays: Number(data.unpaid_days || 0),
      leaveMode: String(data.leave_mode || "paid"),
      isHalfDay,
      reason: data.reason,
      status: data.status,
      adminRemark: data.admin_remark,
      submittedAt: data.submitted_at,
    },
  });
}
