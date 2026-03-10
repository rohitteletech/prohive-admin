import { parseLeaveScope } from "@/lib/companyReportsLeaves";

type AdminClientLike = {
  from: (table: string) => any;
};

export type EmployeeReportRow = {
  id: string;
  employee: string;
  employeeCode: string;
  department: string;
  designation: string;
  shift: string;
  mobile: string;
  status: "active" | "inactive";
  joinedOn: string;
  mobileAppStatus: string;
  attendanceMode: string;
};

export type EmployeeReportInput = {
  mode?: string;
  monthKey?: string;
  startDate?: string;
  endDate?: string;
  employeeQuery?: string;
  department?: string;
  status?: string;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

export async function getEmployeesReportData(params: {
  admin: AdminClientLike;
  companyId: string;
  input: EmployeeReportInput;
}) {
  const scope = parseLeaveScope(params.input);
  if (!scope.ok) {
    return { ok: false as const, status: 400, error: scope.error };
  }

  const employeeQuery = normalizeText(params.input.employeeQuery).toLowerCase();
  const departmentFilter = normalizeText(params.input.department || "all").toLowerCase();
  const statusFilter = normalizeText(params.input.status || "all").toLowerCase();

  const { data, error } = await params.admin
    .from("employees")
    .select(
      "id,full_name,employee_code,department,designation,shift_name,mobile,status,joined_on,mobile_app_status,attendance_mode"
    )
    .eq("company_id", params.companyId)
    .gte("joined_on", scope.startDate)
    .lte("joined_on", scope.endDate)
    .order("joined_on", { ascending: false });

  if (error) {
    return { ok: false as const, status: 400, error: error.message || "Unable to load employee master report." };
  }

  const rows = (Array.isArray(data) ? data : []).map((row) => {
    const source = row as Record<string, unknown>;
    return {
      id: normalizeText(source.id),
      employee: normalizeText(source.full_name) || "Unknown",
      employeeCode: normalizeText(source.employee_code),
      department: normalizeText(source.department) || "-",
      designation: normalizeText(source.designation) || "-",
      shift: normalizeText(source.shift_name) || "-",
      mobile: normalizeText(source.mobile),
      status: source.status === "inactive" ? "inactive" : "active",
      joinedOn: normalizeText(source.joined_on),
      mobileAppStatus: normalizeText(source.mobile_app_status) || "-",
      attendanceMode: normalizeText(source.attendance_mode) || "-",
    } satisfies EmployeeReportRow;
  });

  const filteredRows = rows.filter((row) => {
    const matchesEmployee = employeeQuery
      ? `${row.employee} ${row.employeeCode} ${row.mobile} ${row.designation} ${row.department}`.toLowerCase().includes(employeeQuery)
      : true;
    const matchesDepartment = departmentFilter === "all" ? true : row.department.trim().toLowerCase() === departmentFilter;
    const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter;
    return matchesEmployee && matchesDepartment && matchesStatus;
  });

  return {
    ok: true as const,
    scope: { startDate: scope.startDate, endDate: scope.endDate },
    rows: filteredRows,
    summary: {
      total: filteredRows.length,
      active: filteredRows.filter((row) => row.status === "active").length,
      inactive: filteredRows.filter((row) => row.status === "inactive").length,
      mobileActive: filteredRows.filter((row) => row.mobileAppStatus === "active").length,
    },
  };
}
