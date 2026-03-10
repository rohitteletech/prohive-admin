import { parseLeaveScope } from "@/lib/companyReportsLeaves";

type AdminClientLike = {
  from: (table: string) => any;
};

export type ClaimReportRow = {
  id: string;
  employee: string;
  employeeCode: string;
  department: string;
  claimType: string;
  amount: number;
  reason: string;
  fromDate: string;
  toDate: string;
  days: number;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  attachment: boolean;
};

export type ClaimReportInput = {
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

function claimTypeLabel(type: string, otherText: string) {
  if (type === "travel") return "Travel";
  if (type === "meal") return "Meal";
  if (type === "other") return otherText ? `Other - ${otherText}` : "Other";
  return "Misc";
}

export async function getClaimsReportData(params: {
  admin: AdminClientLike;
  companyId: string;
  input: ClaimReportInput;
}) {
  const scope = parseLeaveScope(params.input);
  if (!scope.ok) {
    return { ok: false as const, status: 400, error: scope.error };
  }

  const employeeQuery = normalizeText(params.input.employeeQuery).toLowerCase();
  const departmentFilter = normalizeText(params.input.department || "all").toLowerCase();
  const statusFilter = normalizeText(params.input.status || "all").toLowerCase();

  const { data, error } = await params.admin
    .from("employee_claim_requests")
    .select(
      "id,employee_id,from_date,to_date,days,claim_type,claim_type_other_text,amount,reason,attachment_url,status,submitted_at"
      + ",employees(full_name,employee_code,department)"
    )
    .eq("company_id", params.companyId)
    .gte("submitted_at", `${scope.startDate}T00:00:00.000Z`)
    .lt("submitted_at", `${scope.endDate}T23:59:59.999Z`)
    .order("submitted_at", { ascending: false });

  if (error) {
    return { ok: false as const, status: 400, error: error.message || "Unable to load claims report." };
  }

  const rows = (Array.isArray(data) ? data : []).map((row) => {
    const source = row as Record<string, unknown>;
    const employee = (source.employees || {}) as Record<string, unknown>;
    const claimType = normalizeText(source.claim_type).toLowerCase();
    const claimTypeOther = normalizeText(source.claim_type_other_text);
    return {
      id: normalizeText(source.id),
      employee: normalizeText(employee.full_name) || "Unknown",
      employeeCode: normalizeText(employee.employee_code),
      department: normalizeText(employee.department) || "-",
      claimType: claimTypeLabel(claimType, claimTypeOther),
      amount: Number(source.amount || 0),
      reason: normalizeText(source.reason),
      fromDate: normalizeText(source.from_date),
      toDate: normalizeText(source.to_date),
      days: Number(source.days || 0),
      status: (source.status === "approved" || source.status === "rejected" ? source.status : "pending") as
        | "pending"
        | "approved"
        | "rejected",
      submittedAt: normalizeText(source.submitted_at),
      attachment: Boolean(normalizeText(source.attachment_url)),
    } satisfies ClaimReportRow;
  });

  const filteredRows = rows.filter((row) => {
    const matchesEmployee = employeeQuery
      ? `${row.employee} ${row.employeeCode} ${row.reason} ${row.claimType} ${row.department}`.toLowerCase().includes(employeeQuery)
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
      pending: filteredRows.filter((row) => row.status === "pending").length,
      approved: filteredRows.filter((row) => row.status === "approved").length,
      rejected: filteredRows.filter((row) => row.status === "rejected").length,
      totalAmount: Number(filteredRows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
    },
  };
}

function csvEscape(value: string | number | boolean) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function toClaimsCsv(rows: ClaimReportRow[]) {
  const headers = [
    "Employee",
    "Employee Code",
    "Department",
    "Claim Type",
    "Amount",
    "Reason",
    "From Date",
    "To Date",
    "Days",
    "Submitted At",
    "Status",
    "Attachment",
  ];

  const lines = rows.map((row) =>
    [
      row.employee,
      row.employeeCode,
      row.department,
      row.claimType,
      row.amount,
      row.reason,
      row.fromDate,
      row.toDate,
      row.days,
      row.submittedAt,
      row.status,
      row.attachment ? "Yes" : "No",
    ]
      .map(csvEscape)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}
