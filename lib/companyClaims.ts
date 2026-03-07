import { formatDisplayDate, formatDisplayTime } from "@/lib/dateTime";

export type ClaimType = "travel" | "meal" | "misc" | "other";
export type ClaimStatus = "pending" | "approved" | "rejected";

export type ClaimRow = {
  id: string;
  employee: string;
  employeeCode: string;
  claimDate: string;
  claimType: ClaimType;
  claimTypeOther?: string;
  amount: number;
  reason: string;
  attachment?: string;
  submittedAt: string;
  submittedDate: string;
  submittedTime: string;
  status: ClaimStatus;
  adminRemark?: string;
};

function normalizeText(value: unknown) {
  const text = String(value || "").trim();
  return text || undefined;
}

export function claimRowFromDb(row: Record<string, unknown>): ClaimRow {
  const submittedAt = new Date(String(row.submitted_at || ""));
  const employee = (row.employees || {}) as Record<string, unknown>;
  const claimType = String(row.claim_type || "").toLowerCase();
  const claimTypeOther = normalizeText(row.claim_type_other_text);

  return {
    id: String(row.id || ""),
    employee: String(employee.full_name || "Unknown"),
    employeeCode: String(employee.employee_code || ""),
    claimDate: formatDisplayDate(String(row.claim_date || "")),
    claimType: (claimType === "travel" || claimType === "meal" || claimType === "other" ? claimType : "misc") as ClaimType,
    claimTypeOther,
    amount: Number(row.amount || 0),
    reason: String(row.reason || ""),
    attachment: normalizeText(row.attachment_url),
    submittedAt: String(row.submitted_at || ""),
    submittedDate: Number.isNaN(submittedAt.getTime()) ? "" : formatDisplayDate(submittedAt),
    submittedTime: Number.isNaN(submittedAt.getTime()) ? "" : formatDisplayTime(submittedAt),
    status: (row.status === "approved" || row.status === "rejected" ? row.status : "pending") as ClaimStatus,
    adminRemark: normalizeText(row.admin_remark),
  };
}
