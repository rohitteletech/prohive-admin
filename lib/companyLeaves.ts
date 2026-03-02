export type LeavePolicy = {
  id: string;
  name: string;
  code: string;
  annualQuota: number;
  carryForward: number;
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

export type LeaveRequestStatus = "pending" | "approved" | "rejected";

export type LeaveRequestRow = {
  id: string;
  employee: string;
  employeeCode: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  submittedAt: string;
  submittedDate: string;
  submittedTime: string;
  status: LeaveRequestStatus;
  adminRemark?: string;
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
    fromDate: String(row.from_date || ""),
    toDate: String(row.to_date || ""),
    days: Number(row.days || 0),
    reason: String(row.reason || ""),
    submittedAt: String(row.submitted_at || ""),
    submittedDate: Number.isNaN(submittedAt.getTime()) ? "" : submittedAt.toLocaleDateString(),
    submittedTime: Number.isNaN(submittedAt.getTime())
      ? ""
      : submittedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    status: (row.status === "approved" || row.status === "rejected" ? row.status : "pending") as LeaveRequestStatus,
    adminRemark: normalizeText(row.admin_remark) || undefined,
  };
}
