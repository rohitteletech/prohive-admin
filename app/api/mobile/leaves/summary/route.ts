import { NextRequest, NextResponse } from "next/server";
import { formatDisplayDate, formatDisplayDateTime, todayISOInIndia } from "@/lib/dateTime";
import { getMobileSessionContext } from "@/lib/mobileSession";

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
  const range = yearRange(currentYear);

  const [policyResult, requestResult, holidayResult] = await Promise.all([
    session.admin
      .from("company_leave_policies")
      .select("id,name,code,annual_quota,carry_forward,encashable,active")
      .eq("company_id", session.employee.company_id)
      .eq("active", true)
      .order("name", { ascending: true }),
    session.admin
      .from("employee_leave_requests")
      .select("id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,reason,status,admin_remark,submitted_at")
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
    reason: string;
    status: "pending" | "approved" | "rejected";
    admin_remark: string | null;
    submitted_at: string;
  }>;

  const balanceByCode = new Map<string, { approvedUsed: number; pendingUsed: number }>();
  requests.forEach((row) => {
    const entry = balanceByCode.get(row.leave_policy_code) || { approvedUsed: 0, pendingUsed: 0 };
    if (row.status === "approved") {
      entry.approvedUsed += Number(row.days || 0);
    } else if (row.status === "pending") {
      entry.pendingUsed += Number(row.days || 0);
    }
    balanceByCode.set(row.leave_policy_code, entry);
  });

  return NextResponse.json({
    employee: {
      id: session.employee.id,
      employeeCode: session.employee.employee_code,
      fullName: session.employee.full_name,
    },
    balances: (policyResult.data || []).map((row) => {
      const usage = balanceByCode.get(String(row.code)) || { approvedUsed: 0, pendingUsed: 0 };
      const annualQuota = Number(row.annual_quota || 0);
      const carryForward = Number(row.carry_forward || 0);
      const total = annualQuota + carryForward;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        annualQuota,
        carryForward,
        total,
        approvedUsed: usage.approvedUsed,
        pendingUsed: usage.pendingUsed,
        remaining: Math.max(total - usage.approvedUsed, 0),
        encashable: Boolean(row.encashable),
      };
    }),
    requests: requests.map((row) => ({
      id: row.id,
      leavePolicyCode: row.leave_policy_code,
      leaveName: row.leave_name_snapshot,
      fromDate: formatDisplayDate(row.from_date),
      toDate: formatDisplayDate(row.to_date),
      days: Number(row.days || 0),
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
