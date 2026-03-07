"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CompanyEmployee,
  getManagerOptions,
  loadCompanyEmployees,
  loadCompanyEmployeesSupabase,
  nextEmployeeId,
} from "@/lib/companyEmployees";
import { formatDisplayDate, todayISOInIndia } from "@/lib/dateTime";
import { COMPANY_SHIFT_STORAGE_KEY, loadActiveShiftNames } from "@/lib/companyShifts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type EmploymentType = "full_time" | "contract" | "intern";

type EmployeeDraft = {
  full_name: string;
  mobile: string;
  designation: string;
  department: string;
  shift_name: string;
  joining_date: string;
  employee_code: string;
  reporting_manager: string;
  email: string;
  perm_address: string;
  temp_address: string;
  pan: string;
  aadhaar_last4: string;
  emergency_name: string;
  emergency_mobile: string;
  employment_type: EmploymentType | "";
  attendance_mode: "office_only" | "field_staff";
};

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

function nextEmployeeCode(rows: CompanyEmployee[]) {
  const max = rows.reduce((acc, row) => {
    const match = row.employee_code.toUpperCase().match(/^EMP-(\d+)$/);
    if (!match) return acc;
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.max(acc, value) : acc;
  }, 0);

  return `EMP-${String(max + 1).padStart(6, "0")}`;
}

export default function NewEmployeePage() {
  const router = useRouter();
  const [initialShiftOptions] = useState(() => loadActiveShiftNames());
  const [initialEmployees] = useState(() => loadCompanyEmployees());
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "checking" | "creating">("idle");
  const [fieldErrors, setFieldErrors] = useState<{ mobile?: string; employee_code?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [allEmployees, setAllEmployees] = useState<CompanyEmployee[]>(initialEmployees);
  const [shiftOptions, setShiftOptions] = useState<string[]>(initialShiftOptions);
  const [form, setForm] = useState<EmployeeDraft>({
    full_name: "",
    mobile: "",
    designation: "",
    department: "",
    shift_name: initialShiftOptions[0] || "",
    joining_date: todayISOInIndia(),
    employee_code: nextEmployeeCode(initialEmployees),
    reporting_manager: "Admin",
    email: "",
    perm_address: "",
    temp_address: "",
    pan: "",
    aadhaar_last4: "",
    emergency_name: "",
    emergency_mobile: "",
    employment_type: "",
    attendance_mode: "office_only",
  });

  const managerOptions = useMemo(
    () => getManagerOptions(allEmployees, form.full_name),
    [allEmployees, form.full_name]
  );

  useEffect(() => {
    let ignore = false;
    async function hydrateEmployees() {
      const rows = await loadCompanyEmployeesSupabase();
      if (!ignore) {
        setAllEmployees(rows);
        setForm((prev) =>
          prev.employee_code === nextEmployeeCode(initialEmployees) || !prev.employee_code.trim()
            ? { ...prev, employee_code: nextEmployeeCode(rows) }
            : prev
        );
      }
    }
    hydrateEmployees();

    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== COMPANY_SHIFT_STORAGE_KEY) return;
      const names = loadActiveShiftNames();
      setShiftOptions(names);
      setForm((prev) => (names.includes(prev.shift_name) ? prev : { ...prev, shift_name: names[0] || "" }));
    };
    window.addEventListener("storage", onStorage);
    return () => {
      ignore = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [initialEmployees]);

  function setField<K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) {
    setSubmitError(null);
    if (key === "mobile" || key === "employee_code") {
      setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate() {
    if (form.full_name.trim().length < 2) return "Full Name is required";
    if (form.mobile.trim().length < 8) return "Mobile is required";
    if (form.department.trim().length < 2) return "Department is required";
    if (form.designation.trim().length < 2) return "Designation is required";
    if (!form.joining_date) return "Joining Date is required";
    if (form.joining_date > todayISOInIndia()) return "Joining Date cannot be in the future";
    if (!form.employee_code.trim()) return "Employee Code is required";
    if (form.employee_code.trim().length < 6) return "Employee Code is too short";
    if (
      allEmployees.some(
        (row) => row.employee_code.trim().toUpperCase() === form.employee_code.trim().toUpperCase()
      )
    ) {
      return "Employee Code already exists";
    }
    if (
      allEmployees.some(
        (row) => row.mobile.trim() === form.mobile.trim()
      )
    ) {
      return "Mobile already exists";
    }
    if (form.aadhaar_last4 && form.aadhaar_last4.length !== 4) return "Aadhaar must be last 4 digits";
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    const err = validate();
    if (err) {
      setSubmitError(err);
      return;
    }

    setSubmitState("checking");
    const latestRows = await loadCompanyEmployeesSupabase();
    const normalizedCode = form.employee_code.trim().toUpperCase();
    const duplicateCode = latestRows.some(
      (row) => row.employee_code.trim().toUpperCase() === normalizedCode
    );
    if (duplicateCode) {
      const nextCode = nextEmployeeCode(latestRows);
      setField("employee_code", nextCode);
      setFieldErrors({
        employee_code: `This employee code is already used. Suggested new code: ${nextCode}`,
      });
      setSubmitError("Employee Code already exists. Please use the suggested code.");
      setSubmitState("idle");
      return;
    }
    const normalizedMobile = form.mobile.trim();
    const duplicateMobile = latestRows.some((row) => row.mobile.trim() === normalizedMobile);
    if (duplicateMobile) {
      setFieldErrors({
        mobile: "This mobile number is already registered in the system.",
      });
      setSubmitError("Mobile number already exists in this company.");
      setSubmitState("idle");
      return;
    }

    setSubmitState("creating");

    const next: CompanyEmployee = {
      id: nextEmployeeId(allEmployees),
      full_name: form.full_name.trim(),
      email: form.email.trim() || undefined,
      employee_code: form.employee_code.trim(),
      mobile: form.mobile.trim(),
      designation: form.designation.trim(),
      department: form.department.trim(),
      shift_name: form.shift_name,
      status: "active",
      joined_on: form.joining_date,
      reporting_manager: form.reporting_manager || "Admin",
      perm_address: form.perm_address.trim() || undefined,
      temp_address: form.temp_address.trim() || undefined,
      pan: form.pan.trim().toUpperCase() || undefined,
      aadhaar_last4: form.aadhaar_last4.trim() || undefined,
      emergency_name: form.emergency_name.trim() || undefined,
      emergency_mobile: form.emergency_mobile.trim() || undefined,
      employment_type: form.employment_type || undefined,
      attendance_mode: form.attendance_mode,
    };

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) {
      setSubmitState("idle");
      setSubmitError("Company session not found. Please login again.");
      return;
    }

    const response = await fetch("/api/company/employees", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(next),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSubmitState("idle");
    if (!response.ok || !result.ok) {
      const message = (result.error || "Unable to create employee").trim();
      const lower = message.toLowerCase();
      if (lower.includes("mobile")) {
        setFieldErrors((prev) => ({
          ...prev,
          mobile: "This mobile number is already registered in the system.",
        }));
      }
      if (lower.includes("employee code")) {
        setFieldErrors((prev) => ({
          ...prev,
          employee_code: "This employee code is already in use. Please use a unique code.",
        }));
      }
      setSubmitError(message);
      return;
    }

    setAllEmployees(await loadCompanyEmployeesSupabase());
    setSuccessBanner("Employee added successfully");
    window.setTimeout(() => {
      router.push("/company/employees");
    }, 1300);
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Add Employee</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Create employee profile using the same data model as Manage Employee.
          </p>
        </div>
        <Link href="/company/employees" className="text-sm font-semibold text-zinc-700 hover:text-zinc-900">
          Back to Employees
        </Link>
      </div>

      {successBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white px-6 py-8 text-center shadow-2xl">
            <div className="text-2xl font-bold text-emerald-700">Success</div>
            <div className="mt-3 text-lg font-semibold text-zinc-900">{successBanner}</div>
            <div className="mt-2 text-sm text-zinc-500">Redirecting to Employees...</div>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6" autoComplete="off">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900">Profile</h2>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input label="Full Name *" value={form.full_name} onChange={(v) => setField("full_name", v)} autoComplete="off" />
            <Input
              label="Mobile Number *"
              value={form.mobile}
              onChange={(v) => setField("mobile", v)}
              autoComplete="off"
              error={fieldErrors.mobile}
            />
            <DragDropPicker
              label="Department *"
              value={form.department}
              options={DEPARTMENT_OPTIONS}
              placeholder="Select"
              onChange={(v) => setField("department", v)}
            />
            <DragDropPicker
              label="Designation *"
              value={form.designation}
              options={DESIGNATION_OPTIONS}
              placeholder="Select"
              onChange={(v) => setField("designation", v)}
            />
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">Shift *</div>
              <select
                value={form.shift_name}
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
            </div>
            <Input
              label="Employee Code *"
              value={form.employee_code}
              onChange={(v) => setField("employee_code", v.toUpperCase())}
              autoComplete="off"
              error={fieldErrors.employee_code}
            />
            <Input
              label="Email (Optional)"
              value={form.email}
              onChange={(v) => setField("email", v)}
              placeholder="name@company.com"
              autoComplete="off"
            />

            <ManagerPicker
              label="Reporting Manager (Optional)"
              value={form.reporting_manager}
              options={managerOptions}
              onChange={(v) => setField("reporting_manager", v)}
            />

            <TextArea
              label="Permanent Address (Optional)"
              value={form.perm_address}
              onChange={(v) => setField("perm_address", v)}
              placeholder="Permanent address..."
            />
            <TextArea
              label="Temporary/Current Address (Optional)"
              value={form.temp_address}
              onChange={(v) => setField("temp_address", v)}
              placeholder="Current address..."
            />
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900">Employment and IDs</h2>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <DateInput
              label="Joining Date *"
              value={form.joining_date}
              onChange={(v) => setField("joining_date", v)}
              max={todayISOInIndia()}
            />
            <div className="mt-2 text-xs text-zinc-500">Display format: {formatDisplayDate(form.joining_date)} (IST)</div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">Employment Type (Optional)</div>
              <select
                value={form.employment_type}
                onChange={(e) => setField("employment_type", e.target.value as EmployeeDraft["employment_type"])}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
              >
                <option value="">-</option>
                <option value="full_time">Full-time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-700">Attendance Mode *</div>
              <select
                value={form.attendance_mode}
                onChange={(e) => setField("attendance_mode", e.target.value as EmployeeDraft["attendance_mode"])}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
              >
                <option value="office_only">Office Only</option>
                <option value="field_staff">Field Staff</option>
              </select>
              <div className="mt-2 text-xs text-zinc-500">
                Office Only employees must punch inside office radius. Field Staff can punch from any location.
              </div>
            </div>
            <Input
              label="PAN (Optional)"
              value={form.pan}
              onChange={(v) => setField("pan", v.toUpperCase())}
              placeholder="ABCDE1234F"
              autoComplete="off"
            />
            <Input
              label="Aadhaar Last 4 (Optional)"
              value={form.aadhaar_last4}
              onChange={(v) => setField("aadhaar_last4", v.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              autoComplete="off"
            />
            <Input
              label="Emergency Contact Name (Optional)"
              value={form.emergency_name}
              onChange={(v) => setField("emergency_name", v)}
              autoComplete="off"
            />
            <Input
              label="Emergency Contact Mobile (Optional)"
              value={form.emergency_mobile}
              onChange={(v) => setField("emergency_mobile", v)}
              autoComplete="off"
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitState !== "idle"}
            className={[
              "rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm",
              submitState !== "idle" ? "bg-zinc-400 cursor-not-allowed" : "bg-zinc-900 hover:bg-zinc-800",
            ].join(" ")}
          >
            {submitState === "checking"
              ? "Checking uniqueness..."
              : submitState === "creating"
              ? "Creating..."
              : "Create Employee"}
          </button>
          <Link
            href="/company/employees"
            className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            Cancel
          </Link>
        </div>
        {submitError && (
          <div className="text-sm font-medium text-rose-700">
            {submitError}
          </div>
        )}
        {submitState !== "idle" && (
          <div className="text-xs text-zinc-500">
            {submitState === "checking"
              ? "Validating Employee Code and Mobile Number..."
              : "Creating employee record..."}
          </div>
        )}
      </form>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "off"}
        className={[
          "w-full rounded-2xl px-4 py-3 text-sm text-zinc-900 outline-none transition focus:shadow-sm",
          error
            ? "border border-rose-400 bg-rose-50 focus:border-rose-500"
            : "border border-zinc-200 bg-white focus:border-zinc-300",
        ].join(" ")}
      />
      {error && <div className="mt-2 text-xs font-medium text-rose-700">{error}</div>}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="sm:col-span-2">
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-300 focus:shadow-sm"
      />
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
  disabled,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  max?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        max={max}
        autoComplete="off"
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-300 focus:shadow-sm disabled:bg-zinc-50"
      />
    </div>
  );
}

function DragDropPicker({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
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
          <option key={`${label}-${opt}`} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function ManagerPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { name: string; designation: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <div className="mb-1 text-xs font-medium text-zinc-700">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
      >
        <option value="">Select</option>
        {options.map((opt) => (
          <option key={opt.name} value={opt.name}>
            {opt.name} ({opt.designation})
          </option>
        ))}
      </select>
    </div>
  );
}
