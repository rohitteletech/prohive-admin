import { NextRequest, NextResponse } from "next/server";
import { todayISOInIndia } from "@/lib/dateTime";
import { resolveLeaveTypesRuntime } from "@/lib/companyPolicyRuntime";
import { resolvePoliciesForEmployee } from "@/lib/companyPoliciesServer";
import { computeLeaveEntitlement, fetchLeaveOverrideDays, fetchLeaveUsageForYear, normalizeAccrualMode, roundLeaveDays } from "@/lib/leaveAccrual";
import { getMobileSessionContext } from "@/lib/mobileSession";

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

async function findApprovedOverlap(params: {
  admin: any;
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
    employeeId?: string;
    companyId?: string;
    deviceId?: string;
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

  const fromDate = String(body.fromDate || "").trim();
  const toDate = String(body.toDate || "").trim();
  const reason = String(body.reason || "").trim();

  if (!fromDate) return NextResponse.json({ error: "From date is required." }, { status: 400 });
  if (!toDate) return NextResponse.json({ error: "To date is required." }, { status: 400 });
  if (toDate < fromDate) return NextResponse.json({ error: "To date cannot be before from date." }, { status: 400 });
  if (fromDate.slice(0, 4) !== toDate.slice(0, 4)) {
    return NextResponse.json({ error: "Cross-year leave request is not allowed. Submit year-wise requests." }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "Reason is required." }, { status: 400 });

  const days = diffDaysInclusive(fromDate, toDate);
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
    ["leave"],
  );
  const resolvedLeaveConfig = (policyContext.resolved.leave?.configJson || {}) as Record<string, unknown>;
  const resolvedLeaveTypes = resolveLeaveTypesRuntime(policyContext.resolved.leave);

  const { data: policyRows, error: policyError } = await session.admin
    .from("company_leave_policies")
    .select("id,name,code,annual_quota,carry_forward,accrual_mode,active")
    .eq("company_id", session.employee.company_id)
    .eq("active", true)
    .order("name", { ascending: true });

  if (policyError) {
    return NextResponse.json({ error: policyError.message || "Unable to load leave policies." }, { status: 400 });
  }
  const policies = resolvedLeaveTypes.length > 0
    ? resolvedLeaveTypes.map((leaveType) => ({
        id: leaveType.id,
        name: leaveType.name,
        code: leaveType.code,
        annual_quota: leaveType.annualQuota,
        carry_forward:
          leaveType.carryForwardAllowed && String(resolvedLeaveConfig.carryForwardEnabled || "Yes") !== "No"
            ? Math.max(0, Math.round(Number(resolvedLeaveConfig.maximumCarryForwardDays || 0)))
            : 0,
        accrual_mode: leaveType.accrualRule === "Yearly Upfront" ? "upfront" : "monthly",
        active: true,
      }))
    : Array.isArray(policyRows) ? policyRows : [];
  if (policies.length === 0) {
    return NextResponse.json({ error: "No active leave policy configured. Contact admin." }, { status: 400 });
  }

  const currentYear = Number(fromDate.slice(0, 4));

  const availabilityByPolicy = await Promise.all(
    policies.map(async (policy) => {
      const leavePolicyCode = String(policy.code || "");
      const [usageResult, overrideResult] = await Promise.all([
        fetchLeaveUsageForYear({
          admin: session.admin,
          companyId: session.employee.company_id,
          employeeId: session.employee.id,
          leavePolicyCode,
          year: currentYear,
        }),
        fetchLeaveOverrideDays({
          admin: session.admin,
          companyId: session.employee.company_id,
          employeeId: session.employee.id,
          leavePolicyCode,
          year: currentYear,
        }),
      ]);

      if (usageResult.error) {
        return { policy, availableNow: 0, error: usageResult.error };
      }
      if (overrideResult.error) {
        return { policy, availableNow: 0, error: overrideResult.error };
      }

      const entitlement = computeLeaveEntitlement({
        annualQuota: Number(policy.annual_quota || 0),
        carryForward: Number(policy.carry_forward || 0),
        accrualMode: normalizeAccrualMode(policy.accrual_mode),
        overrideDays: overrideResult.overrideDays,
        asOfIsoDate: todayISOInIndia(),
      });
      const availableNow = Math.max(roundLeaveDays(entitlement.accruedTotal - usageResult.approvedUsed - usageResult.pendingUsed), 0);
      return { policy, availableNow, error: null as string | null };
    })
  );

  const failed = availabilityByPolicy.find((item) => item.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error }, { status: 400 });
  }

  const selected = availabilityByPolicy.reduce((best, item) => {
    if (!best) return item;
    if (item.availableNow > best.availableNow) return item;
    return best;
  }, null as (typeof availabilityByPolicy)[number] | null);
  if (!selected) {
    return NextResponse.json({ error: "Unable to determine leave balance." }, { status: 400 });
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
      status: "pending",
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
      reason: data.reason,
      status: data.status,
      adminRemark: data.admin_remark,
      submittedAt: data.submitted_at,
    },
  });
}
