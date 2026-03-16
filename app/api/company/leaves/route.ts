import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { leaveRequestFromDb } from "@/lib/companyLeaves";
import { restoredDaysForLeaveRequest } from "@/lib/leaveAccrual";
import { todayISOInIndia } from "@/lib/dateTime";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const currentYear = Number(todayISOInIndia().slice(0, 4));
  const { data, error } = await context.admin
    .from("employee_leave_requests")
    .select(
      "id,employee_id,leave_policy_code,leave_name_snapshot,from_date,to_date,days,paid_days,unpaid_days,leave_mode,reason,status,approval_flow_snapshot,admin_remark,submitted_at"
      + ",employees(full_name,employee_code)"
    )
    .eq("company_id", context.companyId)
    .order("submitted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load leave requests." }, { status: 400 });
  }

  const approvedAttendanceDatesByEmployee = new Map<string, Set<string>>();
  const attendanceRowsResult = await context.admin
    .from("attendance_punch_events")
    .select("employee_id,effective_punch_at,server_received_at,approval_status")
    .eq("company_id", context.companyId)
    .in("approval_status", ["auto_approved", "approved"])
    .gte("server_received_at", `${currentYear}-01-01T00:00:00.000Z`)
    .lt("server_received_at", `${currentYear + 1}-01-01T00:00:00.000Z`);

  if (attendanceRowsResult.error) {
    return NextResponse.json({ error: attendanceRowsResult.error.message || "Unable to load attendance overrides." }, { status: 400 });
  }

  ((attendanceRowsResult.data || []) as Array<{
    employee_id?: string | null;
    effective_punch_at?: string | null;
    server_received_at?: string | null;
  }>).forEach((row) => {
    const employeeId = String(row.employee_id || "");
    if (!employeeId) return;
    const iso = row.effective_punch_at || row.server_received_at || "";
    if (!iso) return;
    const current = approvedAttendanceDatesByEmployee.get(employeeId) || new Set<string>();
    current.add(iso.slice(0, 10));
    approvedAttendanceDatesByEmployee.set(employeeId, current);
  });

  return NextResponse.json({
    rows: Array.isArray(data)
      ? data.map((row) => {
          const source = row as unknown as Record<string, unknown>;
          const employeeId = String(source.employee_id || "");
          const restoredDays = restoredDaysForLeaveRequest(
            {
              from_date: String(source.from_date || ""),
              to_date: String(source.to_date || ""),
              status:
                source.status === "approved" ||
                source.status === "pending_manager" ||
                source.status === "pending_hr" ||
                source.status === "rejected"
                  ? (source.status as "approved" | "pending_manager" | "pending_hr" | "rejected")
                  : "pending",
            },
            approvedAttendanceDatesByEmployee.get(employeeId) || new Set<string>(),
          );
          return leaveRequestFromDb({
            ...source,
            restored_days: restoredDays,
            attendance_override_applied: restoredDays > 0,
          });
        })
      : [],
  });
}
