import { formatDisplayDate, formatDisplayTime } from "@/lib/dateTime";

export type LeavePolicy = {
  id: string;
  name: string;
  code: string;
  annualQuota: number;
  carryForward: number;
  accrualMode: "monthly" | "upfront";
  encashable: boolean;
  active: boolean;
};

export type HolidayType = "national" | "festival" | "company";

export type CompanyHoliday = {
  id: string;
  date: string;
  name: string;
  type: HolidayType;
};

export type LeaveRequestStatus = "pending" | "pending_manager" | "pending_hr" | "approved" | "rejected";

export type LeaveRequestRow = {
  id: string;
  employee: string;
  employeeCode: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  fromDate: string;
  toDate: string;
  days: number;
  paidDays: number;
  unpaidDays: number;
  leaveMode: "paid" | "unpaid" | "mixed";
  reason: string;
  submittedAt: string;
  submittedDate: string;
  submittedTime: string;
  status: LeaveRequestStatus;
  approvalFlowSnapshot?: "manager" | "hr" | "manager_hr";
  adminRemark?: string;
  restoredDays: number;
  attendanceOverrideApplied: boolean;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeCode(value: unknown) {
  return normalizeText(value).toUpperCase();
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function sanitizeLeavePolicies(input: unknown) {
  if (!Array.isArray(input)) {
    throw new Error("Leave policies payload must be a list.");
  }

  const seenCodes = new Set<string>();
  return input.map((row) => {
    const source = (row || {}) as Record<string, unknown>;
    const name = normalizeText(source.name);
    const code = normalizeCode(source.code);
    const annualQuota = Number(source.annualQuota);
    const carryForward = Number(source.carryForward);
    const accrualMode = source.accrualMode === "upfront" ? "upfront" : "monthly";
    const encashable = Boolean(source.encashable);
    const active = source.active !== false;

    if (!name) throw new Error("Leave name is required.");
    if (!code) throw new Error("Leave code is required.");
    if (seenCodes.has(code)) throw new Error(`Duplicate leave code: ${code}`);
    if (!Number.isFinite(annualQuota) || annualQuota < 0) throw new Error(`Annual quota is invalid for ${code}.`);
    if (!Number.isFinite(carryForward) || carryForward < 0) throw new Error(`Carry forward is invalid for ${code}.`);

    seenCodes.add(code);
    return {
      id: isUuid(String(source.id || "")) ? String(source.id) : undefined,
      name,
      code,
      annual_quota: Math.round(annualQuota),
      carry_forward: Math.round(carryForward),
      accrual_mode: accrualMode,
      encashable,
      active,
    };
  });
}

export function sanitizeHolidays(input: unknown) {
  if (!Array.isArray(input)) {
    throw new Error("Holidays payload must be a list.");
  }

  const seen = new Set<string>();
  return input.map((row) => {
    const source = (row || {}) as Record<string, unknown>;
    const date = normalizeText(source.date);
    const name = normalizeText(source.name);
    const type = source.type === "national" || source.type === "festival" ? source.type : "company";
    const dedupeKey = `${date}|${name.toLowerCase()}`;

    if (!date) throw new Error("Holiday date is required.");
    if (!name) throw new Error("Holiday name is required.");
    if (seen.has(dedupeKey)) throw new Error(`Duplicate holiday: ${name} (${date})`);

    seen.add(dedupeKey);
    return {
      id: isUuid(String(source.id || "")) ? String(source.id) : undefined,
      holiday_date: date,
      name,
      type,
    };
  });
}

export function leavePolicyFromDb(row: Record<string, unknown>): LeavePolicy {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    code: String(row.code || ""),
    annualQuota: Number(row.annual_quota || 0),
    carryForward: Number(row.carry_forward || 0),
    accrualMode: row.accrual_mode === "upfront" ? "upfront" : "monthly",
    encashable: Boolean(row.encashable),
    active: Boolean(row.active),
  };
}

export function holidayFromDb(row: Record<string, unknown>): CompanyHoliday {
  return {
    id: String(row.id),
    date: String(row.holiday_date || ""),
    name: String(row.name || ""),
    type: (row.type === "national" || row.type === "festival" || row.type === "company"
      ? row.type
      : "company") as HolidayType,
  };
}

export function leaveRequestFromDb(row: Record<string, unknown>): LeaveRequestRow {
  const submittedAt = new Date(String(row.submitted_at || ""));
  const employee = (row.employees || {}) as Record<string, unknown>;

  return {
    id: String(row.id),
    employee: String(employee.full_name || "Unknown"),
    employeeCode: String(employee.employee_code || ""),
    leaveTypeCode: String(row.leave_policy_code || ""),
    leaveTypeName: String(row.leave_name_snapshot || ""),
    fromDate: formatDisplayDate(String(row.from_date || "")),
    toDate: formatDisplayDate(String(row.to_date || "")),
    days: Number(row.days || 0),
    paidDays: Number((row.paid_days ?? row.days) || 0),
    unpaidDays: Number(row.unpaid_days || 0),
    leaveMode: (row.leave_mode === "unpaid" || row.leave_mode === "mixed" ? row.leave_mode : "paid") as "paid" | "unpaid" | "mixed",
    reason: String(row.reason || ""),
    submittedAt: String(row.submitted_at || ""),
    submittedDate: Number.isNaN(submittedAt.getTime()) ? "" : formatDisplayDate(submittedAt),
    submittedTime: Number.isNaN(submittedAt.getTime())
      ? ""
      : formatDisplayTime(submittedAt),
    status:
      row.status === "approved" ||
      row.status === "rejected" ||
      row.status === "pending_manager" ||
      row.status === "pending_hr"
        ? (row.status as LeaveRequestStatus)
        : "pending",
    approvalFlowSnapshot:
      row.approval_flow_snapshot === "manager" ||
      row.approval_flow_snapshot === "hr" ||
      row.approval_flow_snapshot === "manager_hr"
        ? (row.approval_flow_snapshot as "manager" | "hr" | "manager_hr")
        : undefined,
    adminRemark: normalizeText(row.admin_remark) || undefined,
    restoredDays: Number(row.restored_days || 0),
    attendanceOverrideApplied: Boolean(row.attendance_override_applied),
  };
}
