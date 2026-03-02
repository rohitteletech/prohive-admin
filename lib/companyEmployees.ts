"use client";

import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/client";

export type EmpStatus = "active" | "inactive";
export type EmploymentType = "full_time" | "contract" | "intern";

export type CompanyEmployee = {
  id: string;
  full_name: string;
  email?: string;
  employee_code: string;
  mobile: string;
  designation: string;
  department?: string;
  shift_name?: string;
  status: EmpStatus;
  joined_on: string;
  reporting_manager?: string;
  perm_address?: string;
  temp_address?: string;
  pan?: string;
  aadhaar_last4?: string;
  emergency_name?: string;
  emergency_mobile?: string;
  employment_type?: EmploymentType;
  exit_date?: string;
  mobile_app_status?: "invited" | "active" | "blocked";
  mobile_verified_at?: string;
  bound_device_id?: string;
  bound_device_name?: string;
  bound_app_version?: string;
  bound_device_at?: string;
  mobile_last_login_at?: string;
  attendance_mode?: "office_only" | "field_staff";
};

export type ManagerOption = {
  name: string;
  designation: string;
};

export type EmployeeWriteResult = {
  ok: boolean;
  rows: CompanyEmployee[];
  error?: string;
};

const STORAGE_KEY = "phv_company_employees_v1";

const EMPTY_EMPLOYEES: CompanyEmployee[] = [];
const LEGACY_DEMO_IDS = new Set(["e001", "e002", "e003", "e004", "e005"]);
const TABLE_NAME = "employees";

type EmployeeDbRow = {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  employee_code: string;
  mobile: string;
  designation: string;
  department: string | null;
  shift_name: string | null;
  status: EmpStatus;
  joined_on: string;
  reporting_manager: string | null;
  perm_address: string | null;
  temp_address: string | null;
  pan: string | null;
  aadhaar_last4: string | null;
  emergency_name: string | null;
  emergency_mobile: string | null;
  employment_type: EmploymentType | null;
  exit_date: string | null;
  mobile_app_status: "invited" | "active" | "blocked";
  mobile_verified_at: string | null;
  bound_device_id: string | null;
  bound_device_name: string | null;
  bound_app_version: string | null;
  bound_device_at: string | null;
  mobile_last_login_at: string | null;
  attendance_mode: "office_only" | "field_staff";
};

type EmployeeUpsertInput = {
  id?: string;
  company_id: string;
  full_name: string;
  email?: string | null;
  employee_code: string;
  mobile: string;
  designation: string;
  department?: string | null;
  shift_name?: string | null;
  status: EmpStatus;
  joined_on: string;
  reporting_manager?: string | null;
  perm_address?: string | null;
  temp_address?: string | null;
  pan?: string | null;
  aadhaar_last4?: string | null;
  emergency_name?: string | null;
  emergency_mobile?: string | null;
  employment_type?: EmploymentType | null;
  exit_date?: string | null;
  attendance_mode?: "office_only" | "field_staff";
};

function hasWindow() {
  return typeof window !== "undefined";
}

function companyIdFromStorage() {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem("phv_company");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id || null;
  } catch {
    return null;
  }
}

function normalizeOptional(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : undefined;
}

function toEmployee(row: EmployeeDbRow): CompanyEmployee {
  return {
    id: row.id,
    full_name: row.full_name,
    email: normalizeOptional(row.email),
    employee_code: row.employee_code,
    mobile: row.mobile,
    designation: row.designation,
    department: normalizeOptional(row.department),
    shift_name: normalizeOptional(row.shift_name),
    status: row.status,
    joined_on: row.joined_on,
    reporting_manager: normalizeOptional(row.reporting_manager),
    perm_address: normalizeOptional(row.perm_address),
    temp_address: normalizeOptional(row.temp_address),
    pan: normalizeOptional(row.pan),
    aadhaar_last4: normalizeOptional(row.aadhaar_last4),
    emergency_name: normalizeOptional(row.emergency_name),
    emergency_mobile: normalizeOptional(row.emergency_mobile),
    employment_type: row.employment_type || undefined,
    exit_date: normalizeOptional(row.exit_date),
    mobile_app_status: row.mobile_app_status,
    mobile_verified_at: normalizeOptional(row.mobile_verified_at),
    bound_device_id: normalizeOptional(row.bound_device_id),
    bound_device_name: normalizeOptional(row.bound_device_name),
    bound_app_version: normalizeOptional(row.bound_app_version),
    bound_device_at: normalizeOptional(row.bound_device_at),
    mobile_last_login_at: normalizeOptional(row.mobile_last_login_at),
    attendance_mode: row.attendance_mode,
  };
}

function isLegacyDemoDataset(rows: CompanyEmployee[]) {
  if (rows.length !== LEGACY_DEMO_IDS.size) return false;
  return rows.every(
    (row) =>
      LEGACY_DEMO_IDS.has(row.id) &&
      typeof row.email === "string" &&
      row.email.toLowerCase().endsWith("@demo.com")
  );
}

export function loadCompanyEmployees(): CompanyEmployee[] {
  if (!hasWindow()) return EMPTY_EMPLOYEES;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return EMPTY_EMPLOYEES;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_EMPLOYEES;
    const rows = parsed as CompanyEmployee[];
    if (isLegacyDemoDataset(rows)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return EMPTY_EMPLOYEES;
    }
    return rows;
  } catch {
    return EMPTY_EMPLOYEES;
  }
}

export function saveCompanyEmployees(rows: CompanyEmployee[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export async function loadCompanyEmployeesSupabase() {
  if (!hasSupabaseEnv()) return loadCompanyEmployees();

  const companyId = companyIdFromStorage();
  const supabase = getSupabaseBrowserClient("company");
  if (!companyId || !supabase) return loadCompanyEmployees();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(
      "id,company_id,full_name,email,employee_code,mobile,designation,department,shift_name,status,joined_on,reporting_manager,perm_address,temp_address,pan,aadhaar_last4,emergency_name,emergency_mobile,employment_type,exit_date,mobile_app_status,mobile_verified_at,bound_device_id,bound_device_name,bound_app_version,bound_device_at,mobile_last_login_at"
      + ",attendance_mode"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    return loadCompanyEmployees();
  }

  const rows = (data as unknown as EmployeeDbRow[]).map(toEmployee);
  saveCompanyEmployees(rows);
  return rows;
}

export async function getCompanyEmployeeByIdSupabase(id: string) {
  if (!hasSupabaseEnv()) return getCompanyEmployeeById(id);

  const companyId = companyIdFromStorage();
  const supabase = getSupabaseBrowserClient("company");
  if (!companyId || !supabase) return getCompanyEmployeeById(id);

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(
      "id,company_id,full_name,email,employee_code,mobile,designation,department,shift_name,status,joined_on,reporting_manager,perm_address,temp_address,pan,aadhaar_last4,emergency_name,emergency_mobile,employment_type,exit_date,mobile_app_status,mobile_verified_at,bound_device_id,bound_device_name,bound_app_version,bound_device_at,mobile_last_login_at"
      + ",attendance_mode"
    )
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return getCompanyEmployeeById(id);
  return toEmployee(data as unknown as EmployeeDbRow);
}

export async function upsertCompanyEmployeeSupabase(next: CompanyEmployee) {
  if (!hasSupabaseEnv()) {
    return {
      ok: true,
      rows: upsertCompanyEmployee(next),
    } satisfies EmployeeWriteResult;
  }

  const companyId = companyIdFromStorage();
  const supabase = getSupabaseBrowserClient("company");
  if (!companyId || !supabase) {
    return {
      ok: false,
      rows: loadCompanyEmployees(),
      error: "Company session not found. Please login again.",
    } satisfies EmployeeWriteResult;
  }

  const payload: EmployeeUpsertInput = {
    id: next.id || undefined,
    company_id: companyId,
    full_name: next.full_name.trim(),
    email: normalizeOptional(next.email) || null,
    employee_code: next.employee_code.trim(),
    mobile: next.mobile.trim(),
    designation: next.designation.trim(),
    department: normalizeOptional(next.department) || null,
    shift_name: normalizeOptional(next.shift_name) || null,
    status: next.status,
    joined_on: next.joined_on,
    reporting_manager: normalizeOptional(next.reporting_manager) || null,
    perm_address: normalizeOptional(next.perm_address) || null,
    temp_address: normalizeOptional(next.temp_address) || null,
    pan: normalizeOptional(next.pan) || null,
    aadhaar_last4: normalizeOptional(next.aadhaar_last4) || null,
    emergency_name: normalizeOptional(next.emergency_name) || null,
    emergency_mobile: normalizeOptional(next.emergency_mobile) || null,
    employment_type: next.employment_type || null,
    exit_date: normalizeOptional(next.exit_date) || null,
    attendance_mode: next.attendance_mode === "office_only" ? "office_only" : "field_staff",
  };

  const { error } = await supabase.from(TABLE_NAME).upsert(payload, { onConflict: "id" });
  if (error) {
    return {
      ok: false,
      rows: loadCompanyEmployees(),
      error: error.message || "Unable to save employee.",
    } satisfies EmployeeWriteResult;
  }

  return {
    ok: true,
    rows: await loadCompanyEmployeesSupabase(),
  } satisfies EmployeeWriteResult;
}

export async function resetCompanyEmployeeDeviceBindingSupabase(id: string) {
  if (!hasSupabaseEnv()) {
    return null;
  }

  const companyId = companyIdFromStorage();
  const supabase = getSupabaseBrowserClient("company");
  if (!companyId || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      bound_device_id: null,
      bound_device_name: null,
      bound_app_version: null,
      bound_device_at: null,
      mobile_last_login_at: null,
    })
    .eq("company_id", companyId)
    .eq("id", id)
    .select(
      "id,company_id,full_name,email,employee_code,mobile,designation,department,shift_name,status,joined_on,reporting_manager,perm_address,temp_address,pan,aadhaar_last4,emergency_name,emergency_mobile,employment_type,exit_date,mobile_app_status,mobile_verified_at,bound_device_id,bound_device_name,bound_app_version,bound_device_at,mobile_last_login_at"
      + ",attendance_mode"
    )
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const employee = toEmployee(data as unknown as EmployeeDbRow);
  const rows = await loadCompanyEmployeesSupabase();
  const idx = rows.findIndex((row) => row.id === employee.id);
  if (idx >= 0) {
    rows[idx] = employee;
    saveCompanyEmployees(rows);
  }
  return employee;
}

export function upsertCompanyEmployee(next: CompanyEmployee) {
  const rows = loadCompanyEmployees();
  const idx = rows.findIndex((r) => r.id === next.id);
  const out = idx >= 0 ? [...rows.slice(0, idx), next, ...rows.slice(idx + 1)] : [...rows, next];
  saveCompanyEmployees(out);
  return out;
}

export function getCompanyEmployeeById(id: string) {
  return loadCompanyEmployees().find((r) => r.id === id);
}

export function nextEmployeeId(rows: CompanyEmployee[]) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const max = rows.reduce((acc, r) => {
    const n = Number(r.id.replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `e${String(max + 1).padStart(3, "0")}`;
}

export function getManagerOptions(rows: CompanyEmployee[], selfName?: string): ManagerOption[] {
  const roleRe = /(manager|admin|lead|supervisor)/i;
  const map = new Map<string, string>();
  map.set("Admin", "System Admin");

  rows.forEach((r) => {
    if (r.status !== "active") return;
    if (!roleRe.test(r.designation)) return;
    if (selfName && r.full_name === selfName) return;
    map.set(r.full_name, r.designation);
  });

  return Array.from(map.entries()).map(([name, designation]) => ({ name, designation }));
}
