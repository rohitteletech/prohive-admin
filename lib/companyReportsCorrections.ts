import { expirePendingCorrections } from "@/lib/attendanceCorrections";
import { correctionRowFromDb } from "@/lib/companyCorrections";
import { parseLeaveScope } from "@/lib/companyReportsLeaves";

type AdminClientLike = {
  from: (table: string) => any;
};

export type CorrectionReportRow = {
  id: string;
  employee: string;
  employeeCode: string;
  correctionDateIso: string;
  correctionDate: string;
  requestedIn: string;
  requestedOut: string;
  reason: string;
  submittedAt: string;
  submittedDate: string;
  submittedTime: string;
  status: "pending" | "approved" | "rejected";
  adminRemark?: string;
};

export type CorrectionReportInput = {
  mode?: string;
  monthKey?: string;
  startDate?: string;
  endDate?: string;
  employeeQuery?: string;
  status?: string;
};

export async function getCorrectionsReportData(params: {
  admin: AdminClientLike;
  companyId: string;
  input: CorrectionReportInput;
}) {
  const scope = parseLeaveScope(params.input);
  if (!scope.ok) {
    return { ok: false as const, status: 400, error: scope.error };
  }

  await expirePendingCorrections(params.admin as never, params.companyId);

  const employeeQuery = String(params.input.employeeQuery || "").trim().toLowerCase();
  const statusFilter = String(params.input.status || "all").trim().toLowerCase();

  const { data, error } = await params.admin
    .from("employee_attendance_corrections")
    .select(
      "id,employee_id,correction_date,requested_check_in,requested_check_out,reason,status,admin_remark,submitted_at"
      + ",employees(full_name,employee_code)"
    )
    .eq("company_id", params.companyId)
    .gte("correction_date", scope.startDate)
    .lte("correction_date", scope.endDate)
    .order("submitted_at", { ascending: false });

  if (error) {
    return { ok: false as const, status: 400, error: error.message || "Unable to load corrections report." };
  }

  const rows = (Array.isArray(data) ? data : []).map((row) =>
    correctionRowFromDb(row as unknown as Record<string, unknown>)
  ) as CorrectionReportRow[];

  const filteredRows = rows.filter((row) => {
    const matchesEmployee = employeeQuery
      ? `${row.employee} ${row.employeeCode} ${row.reason} ${row.requestedIn} ${row.requestedOut}`.toLowerCase().includes(employeeQuery)
      : true;
    const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter;
    return matchesEmployee && matchesStatus;
  });

  return {
    ok: true as const,
    scope: { startDate: scope.startDate, endDate: scope.endDate },
    rows: filteredRows,
    summary: {
      total: filteredRows.length,
      pending: filteredRows.filter((row) => row.status === "pending").length,
      approved: filteredRows.filter((row) => row.status === "approved").length,
      rejected: filteredRows.filter((row) => row.status === "rejected").length,
    },
  };
}
