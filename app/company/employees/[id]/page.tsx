"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CompanyEmployee,
  getCompanyEmployeeByIdSupabase,
  getManagerOptions,
  loadCompanyEmployees,
  loadCompanyEmployeesSupabase,
} from "@/lib/companyEmployees";
import { formatDisplayDate, formatDisplayDateTime, todayISOInIndia } from "@/lib/dateTime";
import { COMPANY_SHIFT_STORAGE_KEY, loadActiveShiftNames } from "@/lib/companyShifts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TabKey = "profile" | "employment" | "ids" | "security";
type EmpStatus = "active" | "inactive";
type EmploymentType = "full_time" | "contract" | "intern";

type EmployeeModel = {
  id: string;
  // Compulsory
  full_name: string;
  gender?: "male" | "female" | "other";
  mobile: string;
  designation: string;
  department?: string;
  shift_name?: string;
  joining_date: string; // YYYY-MM-DD
  employee_code: string; // hybrid: auto + HR editable (uniqueness later)

  // System
  status: EmpStatus;
  email?: string;
  reporting_manager?: string;

  // Address (optional)
  perm_address?: string;
  temp_address?: string;

  // IDs (optional)
  pan?: string;
  aadhaar_last4?: string; // store last4 only for demo display
  emergency_name?: string;
  emergency_mobile?: string;

  // Employment (optional)
  exit_date?: string; // only if inactive
  employment_type?: EmploymentType;
  attendance_mode?: "office_only" | "field_staff";

  // Security / device binding
  device_bound: boolean;
  mobile_app_status?: "invited" | "active" | "blocked";
  device_info?: {
    device_id_masked: string;
    model: string;
    platform: "Android" | "iOS";
    app_version: string;
    bound_at: string; // demo text
    last_seen: string; // demo text
  };
};

function formatEmpType(v?: EmployeeModel["employment_type"]) {
  if (!v) return "-";
  if (v === "full_time") return "Full-time";
  if (v === "contract") return "Contract";
  return "Intern";
}

function maskPan(pan?: string) {
  if (!pan) return "-";
  // Keep first 5 and last 1 as readable, mask middle
  // Example: ABCDE1234F -> ABCDE****F
  if (pan.length < 6) return pan;
  return pan.slice(0, 5) + "****" + pan.slice(-1);
}

function maskAadhaar(last4?: string) {
  if (!last4) return "-";
  return `XXXX-XXXX-${last4}`;
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatDisplayDateTime(parsed);
}

function maskDeviceId(value?: string) {
  if (!value) return "-";
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function deviceInfoFromEmployee(employee?: CompanyEmployee): EmployeeModel["device_info"] | undefined {
  if (!employee?.bound_device_id) return undefined;
  return {
    device_id_masked: maskDeviceId(employee.bound_device_id),
    model: employee.bound_device_name || "Unknown device",
    platform: "Android",
    app_version: employee.bound_app_version || "Unknown",
    bound_at: formatDateTime(employee.bound_device_at),
    last_seen: formatDateTime(employee.mobile_last_login_at),
  };
}

const DESIGNATION_OPTIONS = [
  "Software Engineer",
  "Senior Engineer",
  "Team Lead",
  "Manager",
  "HR Executive",
  "Accountant",
  "Sales Executive",
  "Operations Executive",
];

const DEPARTMENT_OPTIONS = [
  "Engineering",
  "HR",
  "Accounts",
  "Sales",
  "Operations",
  "Support",
  "Administration",
];

function parseEmploymentType(value: string): EmploymentType | undefined {
  if (value === "full_time" || value === "contract" || value === "intern") return value;
  return undefined;
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "e001";
  const [loading, setLoading] = useState(true);

  // Initial state from local cache; will hydrate from Supabase.
  const initial: EmployeeModel = useMemo(
    () => {
      const base = loadCompanyEmployees().find((row) => row.id === id);
      return {
      id,
      full_name: base?.full_name || "",
      gender: base?.gender,
      mobile: base?.mobile || "",
      designation: base?.designation || "",
      department: base?.department || "",
      shift_name: base?.shift_name || "",
      joining_date: base?.joined_on || "",
      employee_code: base?.employee_code || "",
      status: base?.status || "active",
      email: base?.email,
      reporting_manager: base?.reporting_manager || "Admin",

      perm_address: "",
      temp_address: "",

      pan: "",
      aadhaar_last4: "",
      emergency_name: "",
      emergency_mobile: "",

        employment_type: undefined,
        attendance_mode: base?.attendance_mode || "office_only",

      device_bound: Boolean(base?.bound_device_id),
      mobile_app_status: base?.mobile_app_status,
      device_info: deviceInfoFromEmployee(base),
    };
    },
    [id]
  );

  const [tab, setTab] = useState<TabKey>("profile");

  // Edit mode: read-only by default
  const [isEditing, setIsEditing] = useState(false);

  // Working state (editable copy)
  const [draft, setDraft] = useState<EmployeeModel>(initial);
  // "Saved" state (read-only source)
  const [saved, setSaved] = useState<EmployeeModel>(initial);
  const [allEmployees, setAllEmployees] = useState<CompanyEmployee[]>(() => loadCompanyEmployees());
  const [shiftOptions, setShiftOptions] = useState<string[]>(() => loadActiveShiftNames());

  const [toast, setToast] = useState<string | null>(null);

  function showToast(t: string) {
    setToast(t);
    window.setTimeout(() => setToast(null), 1600);
  }

  function startEdit() {
    setDraft(saved);
    setIsEditing(true);
    showToast("Edit mode enabled");
  }

  function cancelEdit() {
    setDraft(saved);
    setIsEditing(false);
    showToast("Changes discarded");
  }

  async function saveEdit() {
    // Client-side validations (MVP)
    const nameOk = draft.full_name.trim().length >= 2;
    const mobileOk = draft.mobile.trim().length >= 8;
    const genderOk = !!draft.gender;
    const desigOk = draft.designation.trim().length >= 2;
    const deptOk = (draft.department || "").trim().length >= 2;
    const joinOk = draft.joining_date?.trim().length === 10;

    if (!nameOk) return showToast("Name is required");
    if (!mobileOk) return showToast("Mobile is required");
    if (!genderOk) return showToast("Gender is required");
    if (!desigOk) return showToast("Designation is required");
    if (!deptOk) return showToast("Department is required");
    if (!joinOk) return showToast("Joining date is required");
    if (draft.joining_date > todayISOInIndia()) return showToast("Joining date cannot be in the future");

    if (draft.status === "inactive" && !draft.exit_date) {
      return showToast("Exit date required for Inactive employee");
    }

    // Hybrid code: editable allowed; uniqueness check later via backend
    if (!draft.employee_code.trim()) return showToast("Employee Code required");

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) {
      return showToast("Company session not found. Please login again.");
    }

    const response = await fetch(`/api/company/employees/${draft.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        full_name: draft.full_name,
        gender: draft.gender,
        email: draft.email,
        employee_code: draft.employee_code,
        mobile: draft.mobile,
        designation: draft.designation,
        department: draft.department,
        shift_name: draft.shift_name,
        status: draft.status,
        joined_on: draft.joining_date,
        reporting_manager: draft.reporting_manager,
        perm_address: draft.perm_address,
        temp_address: draft.temp_address,
        pan: draft.pan,
        aadhaar_last4: draft.aadhaar_last4,
        emergency_name: draft.emergency_name,
        emergency_mobile: draft.emergency_mobile,
        employment_type: draft.employment_type,
        exit_date: draft.exit_date,
        attendance_mode: draft.attendance_mode,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      return showToast(result.error || "Unable to save profile");
    }

    const refreshed = await getCompanyEmployeeByIdSupabase(draft.id);
    const rows = await loadCompanyEmployeesSupabase();
    if (!refreshed) {
      return showToast("Profile saved, but refresh failed");
    }

    const nextSaved: EmployeeModel = {
      ...draft,
      device_bound: Boolean(refreshed.bound_device_id),
      mobile_app_status: refreshed.mobile_app_status,
      device_info: deviceInfoFromEmployee(refreshed),
    };

    setSaved(nextSaved);
    setDraft(nextSaved);
    setAllEmployees(rows);
    setIsEditing(false);
    showToast("Profile saved");
  }

  function setField<K extends keyof EmployeeModel>(key: K, value: EmployeeModel[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function setStatus(v: EmpStatus) {
    // If status becomes active, clear exit date
    if (v === "active") {
      setDraft((p) => ({ ...p, status: "active", exit_date: undefined }));
    } else {
      setDraft((p) => ({ ...p, status: "inactive", exit_date: p.exit_date || todayISOInIndia() }));
    }
  }

  async function resetDevice() {
    if (!saved.device_bound) return showToast("No device is bound");
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) {
      showToast("Company session not found. Please login again.");
      return;
    }

    const response = await fetch(`/api/company/employees/${saved.id}/reset-binding`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      showToast(result.error || "Unable to reset device binding");
      return;
    }

    const updated = await getCompanyEmployeeByIdSupabase(saved.id);
    if (!updated) {
      showToast("Device binding reset, but refresh failed");
      return;
    }

    const next: EmployeeModel = {
      ...saved,
      device_bound: Boolean(updated.bound_device_id),
      mobile_app_status: updated.mobile_app_status,
      device_info: deviceInfoFromEmployee(updated),
    };
    setSaved(next);
    setDraft(next);
    setAllEmployees(await loadCompanyEmployeesSupabase());
    showToast("Device binding reset");
  }

  const data = isEditing ? draft : saved;
  const managerOptions = useMemo(
    () => getManagerOptions(allEmployees, data.full_name),
    [allEmployees, data.full_name]
  );

  useEffect(() => {
    let ignore = false;
    async function hydrate() {
      const [employee, all] = await Promise.all([
        getCompanyEmployeeByIdSupabase(id),
        loadCompanyEmployeesSupabase(),
      ]);
      if (ignore) return;
      setAllEmployees(all);
      if (employee) {
        const hydrated: EmployeeModel = {
          id: employee.id,
          full_name: employee.full_name || "",
          gender: employee.gender,
          mobile: employee.mobile || "",
          designation: employee.designation || "",
          department: employee.department || "",
          shift_name: employee.shift_name || "",
          joining_date: employee.joined_on || "",
          employee_code: employee.employee_code || "",
          status: employee.status || "active",
          email: employee.email,
          reporting_manager: employee.reporting_manager || "Admin",
          perm_address: employee.perm_address || "",
          temp_address: employee.temp_address || "",
          pan: employee.pan || "",
          aadhaar_last4: employee.aadhaar_last4 || "",
          emergency_name: employee.emergency_name || "",
          emergency_mobile: employee.emergency_mobile || "",
          employment_type: employee.employment_type,
          attendance_mode: employee.attendance_mode || "office_only",
          exit_date: employee.exit_date || undefined,
          device_bound: Boolean(employee.bound_device_id),
          mobile_app_status: employee.mobile_app_status,
          device_info: deviceInfoFromEmployee(employee),
        };
        setDraft(hydrated);
        setSaved(hydrated);
      }
      setLoading(false);
    }
    hydrate();

    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "phv_company_employees_v1" && e.key !== COMPANY_SHIFT_STORAGE_KEY) return;
      if (!e.key || e.key === "phv_company_employees_v1") setAllEmployees(loadCompanyEmployees());
      if (!e.key || e.key === COMPANY_SHIFT_STORAGE_KEY) {
        const next = loadActiveShiftNames();
        setShiftOptions(next);
        setDraft((prev) => (next.includes(prev.shift_name || "") ? prev : { ...prev, shift_name: next[0] || "" }));
        setSaved((prev) => (next.includes(prev.shift_name || "") ? prev : { ...prev, shift_name: next[0] || "" }));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      ignore = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 text-sm text-zinc-600 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
        Loading employee...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Employee Details
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Master profile (HR + Compliance + Security). Attendance stays in Attendance page.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <Link
            href="/company/employees"
            className="text-sm font-semibold text-zinc-700 hover:text-zinc-900"
          >
            Back to Employees
          </Link>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {toast}
        </div>
      )}

      {/* Summary Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-sm font-extrabold text-zinc-700">
              {data.full_name
                .split(" ")
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase())
                .join("")}
            </div>

            <div>
              <div className="text-lg font-bold text-zinc-900">{data.full_name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs">
                  Code: <span className="font-semibold text-zinc-900">{data.employee_code}</span>
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs">
                  {data.designation}
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs">
                  {data.department || "-"}
                </span>
                {data.status === "active" ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                    Inactive
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Top actions */}
          <div className="flex items-center gap-3">
            {!isEditing ? (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
              >
                Edit Profile
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={saveEdit}
                  className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {([
          ["profile", "Profile"],
          ["employment", "Employment"],
          ["ids", "IDs"],
          ["security", "Security"],
        ] as [TabKey, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === k
                ? "bg-zinc-900 text-white shadow-sm"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {/* PROFILE TAB */}
        {tab === "profile" && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Full Name *"
              value={data.full_name}
              editable={isEditing}
              onChange={(v) => setField("full_name", v)}
            />
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">Gender *</div>
              {!isEditing ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
                  {data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : "-"}
                </div>
              ) : (
                <select
                  value={draft.gender || ""}
                  onChange={(e) => setField("gender", (e.target.value || undefined) as EmployeeModel["gender"])}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              )}
            </div>
            <Field
              label="Mobile Number *"
              value={data.mobile}
              editable={isEditing}
              onChange={(v) => setField("mobile", v)}
            />

            <DragDropField
              label="Department *"
              value={data.department || ""}
              editable={isEditing}
              options={DEPARTMENT_OPTIONS}
              placeholder="Select"
              onChange={(v) => setField("department", v)}
            />

            <DragDropField
              label="Designation *"
              value={data.designation}
              editable={isEditing}
              options={DESIGNATION_OPTIONS}
              placeholder="Select"
              onChange={(v) => setField("designation", v)}
            />

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">Shift *</div>
              {!isEditing ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
                  {data.shift_name || "-"}
                </div>
              ) : (
                <select
                  value={draft.shift_name || ""}
                  onChange={(e) => setField("shift_name", e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
                >
                  {!shiftOptions.length && <option value="">No shift configured</option>}
                  {shiftOptions.map((shift) => (
                    <option key={shift} value={shift}>
                      {shift}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <Field
              label="Employee Code * (Hybrid)"
              value={data.employee_code}
              helper="Auto-generated by system, HR can edit (uniqueness enforced later)."
              editable={isEditing}
              onChange={(v) => setField("employee_code", v.toUpperCase())}
            />

            <Field
              label="Email (Optional)"
              value={data.email || ""}
              editable={isEditing}
              onChange={(v) => setField("email", v)}
              placeholder="name@company.com"
            />

            <ReportingManagerField
              label="Reporting Manager (Optional)"
              value={data.reporting_manager || ""}
              editable={isEditing}
              managers={managerOptions}
              onChange={(v) => setField("reporting_manager", v || undefined)}
            />

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">Status</div>
              {!isEditing ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
                  {data.status === "active" ? "Active" : "Inactive"}
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus("active")}
                    className={[
                      "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold",
                      draft.status === "active"
                        ? "bg-emerald-600 text-white"
                        : "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("inactive")}
                    className={[
                      "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold",
                      draft.status === "inactive"
                        ? "bg-zinc-900 text-white"
                        : "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    Inactive
                  </button>
                </div>
              )}
              <div className="mt-2 text-xs text-zinc-500">
                Active = allowed in system. Inactive = resigned/terminated/disabled.
              </div>
            </div>

            <TextArea
              label="Permanent Address (Optional)"
              value={data.perm_address || ""}
              editable={isEditing}
              onChange={(v) => setField("perm_address", v)}
              placeholder="Permanent address..."
            />
            <TextArea
              label="Temporary/Current Address (Optional)"
              value={data.temp_address || ""}
              editable={isEditing}
              onChange={(v) => setField("temp_address", v)}
              placeholder="Current address..."
            />
          </div>
        )}

        {/* EMPLOYMENT TAB */}
        {tab === "employment" && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <DateField
              label="Joining Date *"
              value={data.joining_date}
              editable={isEditing}
              onChange={(v) => setField("joining_date", v)}
                  max={todayISOInIndia()}
            />

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">
                Exit Date {data.status === "inactive" ? "*" : "(Optional)"}
              </div>

              {!isEditing ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
                  {data.exit_date || "-"}
                </div>
              ) : (
                <input
                  type="date"
                  value={draft.exit_date || ""}
                  onChange={(e) => setField("exit_date", e.target.value)}
                  disabled={draft.status !== "inactive"}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none disabled:bg-zinc-50"
                />
              )}

              <div className="mt-2 text-xs text-zinc-500">
                Exit date required only if employee is Inactive.
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">
                Employment Type (Optional)
              </div>

              {!isEditing ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
                  {formatEmpType(data.employment_type)}
                </div>
              ) : (
                <select
                  value={draft.employment_type || ""}
                  onChange={(e) =>
                    setField(
                      "employment_type",
                      parseEmploymentType(e.target.value)
                    )
                  }
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
                >
                  <option value="">-</option>
                  <option value="full_time">Full-time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              )}

              <div className="mt-2 text-xs text-zinc-500">
                Useful for HR reporting later. Not required for attendance flow.
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">Attendance Mode</div>
              {!isEditing ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
                  {data.attendance_mode === "field_staff" ? "Field Staff" : "Office Only"}
                </div>
              ) : (
                <select
                  value={draft.attendance_mode || "office_only"}
                  onChange={(e) => setField("attendance_mode", e.target.value as EmployeeModel["attendance_mode"])}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
                >
                  <option value="office_only">Office Only</option>
                  <option value="field_staff">Field Staff</option>
                </select>
              )}
              <div className="mt-2 text-xs text-zinc-500">
                Office Only follows company office radius. Field Staff can punch from any location.
              </div>
            </div>
          </div>
        )}

        {/* IDS TAB */}
        {tab === "ids" && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="PAN (Optional)"
              value={isEditing ? data.pan || "" : maskPan(data.pan)}
              editable={isEditing}
              onChange={(v) => setField("pan", v.toUpperCase())}
              placeholder="ABCDE1234F"
              helper={!isEditing ? "Masked display for privacy." : undefined}
            />

            <Field
              label="Aadhaar (Optional)"
              value={isEditing ? data.aadhaar_last4 || "" : maskAadhaar(data.aadhaar_last4)}
              editable={isEditing}
              onChange={(v) => setField("aadhaar_last4", v.replace(/\D/g, "").slice(0, 4))}
              placeholder="Last 4 digits only"
              helper={
                isEditing
                  ? "Store last 4 only (MVP). Full Aadhaar later with secure backend."
                  : "Masked display for privacy."
              }
            />

            <Field
              label="Emergency Contact Name (Optional)"
              value={data.emergency_name || ""}
              editable={isEditing}
              onChange={(v) => setField("emergency_name", v)}
              placeholder="Contact person name"
            />

            <Field
              label="Emergency Contact Mobile (Optional)"
              value={data.emergency_mobile || ""}
              editable={isEditing}
              onChange={(v) => setField("emergency_mobile", v)}
              placeholder="+91 9XXXXXXXXX"
            />
          </div>
        )}

        {/* SECURITY TAB */}
        {tab === "security" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-sm font-semibold text-zinc-900">Device Binding</div>
              <div className="mt-1 text-sm text-zinc-700">
                {data.device_bound
                  ? `Device is currently bound${data.mobile_app_status ? ` (${data.mobile_app_status})` : ""}`
                  : `No device bound${data.mobile_app_status ? ` (${data.mobile_app_status})` : ""}`}
              </div>

              {/* Device info */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoRow label="Device ID" value={data.device_info?.device_id_masked || "-"} />
                <InfoRow label="Platform" value={data.device_info?.platform || "-"} />
                <InfoRow label="Model" value={data.device_info?.model || "-"} />
                <InfoRow label="App Version" value={data.device_info?.app_version || "-"} />
                <InfoRow label="Bound At" value={data.device_info?.bound_at || "-"} />
                <InfoRow label="Last Seen" value={data.device_info?.last_seen || "-"} />
              </div>

              {/* Reset button */}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={resetDevice}
                  disabled={!data.device_bound}
                  className={[
                    "rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm",
                    data.device_bound
                      ? "bg-zinc-900 text-white hover:bg-zinc-800"
                      : "bg-zinc-200 text-zinc-500 cursor-not-allowed",
                  ].join(" ")}
                >
                  Reset Device Binding
                </button>

                <div className="text-xs text-zinc-500">
                  Reset will force employee to bind this device again on next login while keeping the same PIN.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">Notes</div>
              <div className="mt-1 text-sm text-amber-900/80">
                Device reset is a sensitive action. In production, this will be audited and restricted by role.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions (also show for clarity when scrolling) */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!isEditing ? (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
          >
            Edit Profile
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
            >
              Cancel
            </button>
          </>
        )}

        <div className="text-xs text-zinc-500">
          * Required fields: Name, Mobile, Designation, Joining Date, Employee Code
        </div>
      </div>
    </div>
  );
}

/* ---------- Small UI Helpers ---------- */

function DragDropField({
  label,
  value,
  editable,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  if (!editable) {
    return (
      <div>
        <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
          {value?.trim() ? value : "-"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={`${label}-opt-${opt}`} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReportingManagerField({
  label,
  value,
  editable,
  managers,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  managers: { name: string; designation: string }[];
  onChange: (v: string) => void;
}) {
  if (!editable) {
    return (
      <div>
        <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
          {value?.trim() ? value : "-"}
        </div>
      </div>
    );
  }

  return (
    <div className="sm:col-span-2">
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
      >
        <option value="">Select</option>
        {managers.map((manager) => (
          <option key={manager.name} value={manager.name}>
            {manager.name} ({manager.designation})
          </option>
        ))}
      </select>
    </div>
  );
}

function Field({
  label,
  value,
  editable,
  onChange,
  placeholder,
  helper,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      {!editable ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
          {value?.trim() ? value : "-"}
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-300 focus:shadow-sm"
        />
      )}
      {helper && <div className="mt-2 text-xs text-zinc-500">{helper}</div>}
    </div>
  );
}

function TextArea({
  label,
  value,
  editable,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="sm:col-span-2">
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      {!editable ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
          {value?.trim() ? value : "-"}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-300 focus:shadow-sm"
        />
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  editable,
  onChange,
  max,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  max?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      {!editable ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
          {value ? formatDisplayDate(value) : "-"}
        </div>
      ) : (
        <input
          type="date"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          max={max}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-300 focus:shadow-sm"
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
      <div className="text-[11px] font-medium text-zinc-500">{label}</div>
      <div className="text-sm font-semibold text-zinc-900">{value || "-"}</div>
    </div>
  );
}
