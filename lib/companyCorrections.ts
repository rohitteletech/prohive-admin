import { formatDisplayDate, formatDisplayTime } from "@/lib/dateTime";

export type CorrectionStatus = "pending" | "pending_manager" | "pending_hr" | "approved" | "rejected";

export type CorrectionRow = {
  id: string;
  employee: string;
  employeeCode: string;
  policyName: string;
  policyCode: string;
  approvalMode: string;
  correctionDateIso: string;
  correctionDate: string;
  requestedIn: string;
  requestedOut: string;
  reason: string;
  submittedAt: string;
  submittedDate: string;
  submittedTime: string;
  status: CorrectionStatus;
  adminRemark?: string;
};

function normalizeText(value: unknown) {
  const text = String(value || "").trim();
  return text || undefined;
}

function displayTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const hhmm = raw.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : "-";
}

export function correctionRowFromDb(row: Record<string, unknown>): CorrectionRow {
  const submittedAt = new Date(String(row.submitted_at || ""));
  const employee = (row.employees || {}) as Record<string, unknown>;
  const correctionDateIso = String(row.correction_date || "");
  const status = ((): CorrectionStatus => {
    if (row.status === "approved" || row.status === "rejected" || row.status === "pending_manager" || row.status === "pending_hr") {
      return row.status;
    }
    return "pending";
  })();

  return {
    id: String(row.id || ""),
    employee: String(employee.full_name || "Unknown"),
    employeeCode: String(employee.employee_code || ""),
    policyName: String(row.policy_name || "Standard Correction Policy"),
    policyCode: String(row.policy_code || "COR-001"),
    approvalMode: String(row.approval_mode || "Approval Required"),
    correctionDateIso,
    correctionDate: formatDisplayDate(correctionDateIso),
    requestedIn: displayTime(row.requested_check_in),
    requestedOut: displayTime(row.requested_check_out),
    reason: String(row.reason || ""),
    submittedAt: String(row.submitted_at || ""),
    submittedDate: Number.isNaN(submittedAt.getTime()) ? "" : formatDisplayDate(submittedAt),
    submittedTime: Number.isNaN(submittedAt.getTime()) ? "" : formatDisplayTime(submittedAt),
    status,
    adminRemark: normalizeText(row.admin_remark),
  };
}
