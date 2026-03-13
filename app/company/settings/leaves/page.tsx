"use client";

import { useEffect, useMemo, useState } from "react";
import { LeavePolicy } from "@/lib/companyLeaves";
import { formatDisplayDateTime, todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type LeaveOverrideRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  leavePolicyCode: string;
  year: number;
  extraDays: number;
  reason: string;
  createdBy: string;
  updatedAt: string;
};

type OverrideOptionEmployee = {
  id: string;
  name: string;
  employeeCode: string;
  status: string;
};

type OverrideOptionPolicy = {
  code: string;
  name: string;
  active: boolean;
};

export default function Page() {
  const [rows, setRows] = useState<LeavePolicy[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeavePolicy | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overrideRows, setOverrideRows] = useState<LeaveOverrideRow[]>([]);
  const [overrideEmployees, setOverrideEmployees] = useState<OverrideOptionEmployee[]>([]);
  const [overridePolicies, setOverridePolicies] = useState<OverrideOptionPolicy[]>([]);
  const [overrideYear, setOverrideYear] = useState<number>(Number(todayISOInIndia().slice(0, 4)));
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    employeeId: "",
    leavePolicyCode: "",
    extraDays: "",
    reason: "",
  });

  useEffect(() => {
    let ignore = false;

    async function loadPolicies() {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) {
        if (!ignore) {
          setLoading(false);
          setToast("Company session not found. Please login again.");
        }
        return;
      }

      const response = await fetch("/api/company/settings/leaves", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json().catch(() => ({}))) as { policies?: LeavePolicy[]; error?: string };
      if (ignore) return;
      setLoading(false);
      if (!response.ok) {
        setToast(result.error || "Unable to load leave policies.");
        return;
      }
      const policies = Array.isArray(result.policies) ? result.policies : [];
      setRows(policies);
      setOverridePolicies(policies.map((row) => ({ code: row.code, name: row.name, active: row.active })));
    }

    loadPolicies();
    return () => {
      ignore = true;
    };
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.active).length;
    const inactive = rows.filter((r) => !r.active).length;
    const totalQuota = rows.filter((r) => r.active).reduce((acc, r) => acc + r.annualQuota, 0);
    return { total, active, inactive, totalQuota };
  }, [rows]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  useEffect(() => {
    void loadOverrides(overrideYear);
  }, [overrideYear]);

  async function loadOverrides(year: number) {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return;

    setOverrideLoading(true);
    const response = await fetch(`/api/company/leaves/overrides?year=${year}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const result = (await response.json().catch(() => ({}))) as {
      rows?: LeaveOverrideRow[];
      employees?: OverrideOptionEmployee[];
      policies?: OverrideOptionPolicy[];
      error?: string;
    };
    setOverrideLoading(false);
    if (!response.ok) {
      showToast(result.error || "Unable to load leave overrides.");
      return;
    }
    setOverrideRows(Array.isArray(result.rows) ? result.rows : []);
    setOverrideEmployees(Array.isArray(result.employees) ? result.employees : []);
    if (Array.isArray(result.policies) && result.policies.length > 0) {
      setOverridePolicies(result.policies);
    }
  }

  async function saveOverride() {
    const employeeId = overrideForm.employeeId.trim();
    const leavePolicyCode = overrideForm.leavePolicyCode.trim().toUpperCase();
    const extraDays = Number(overrideForm.extraDays);
    const reason = overrideForm.reason.trim();

    if (!employeeId) return showToast("Select employee for override.");
    if (!leavePolicyCode) return showToast("Select leave type for override.");
    if (!Number.isFinite(extraDays)) return showToast("Override days must be numeric.");
    if (extraDays < -365 || extraDays > 365) return showToast("Override days must be between -365 and 365.");
    if (reason.length < 5 || reason.length > 300) return showToast("Reason must be 5 to 300 characters.");

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Company session not found. Please login again.");

    setOverrideSaving(true);
    const response = await fetch("/api/company/leaves/overrides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        employee_id: employeeId,
        leave_policy_code: leavePolicyCode,
        year: overrideYear,
        extra_days: extraDays,
        reason,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setOverrideSaving(false);
    if (!response.ok || !result.ok) {
      return showToast(result.error || "Unable to save leave override.");
    }
    setOverrideForm((prev) => ({ ...prev, extraDays: "", reason: "" }));
    showToast("Leave override saved.");
    await loadOverrides(overrideYear);
  }

  async function deleteOverride(id: string) {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Company session not found. Please login again.");

    const response = await fetch(`/api/company/leaves/overrides/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) return showToast(result.error || "Unable to delete override.");
    showToast("Leave override removed.");
    await loadOverrides(overrideYear);
  }

  function setField<K extends keyof LeavePolicy>(key: K, value: LeavePolicy[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function startEdit(row: LeavePolicy) {
    setEditingId(row.id);
    setDraft({ ...row });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (!draft) return;
    if (!draft.name.trim()) return showToast("Leave name is required");
    if (!draft.code.trim()) return showToast("Leave code is required");
    if (draft.annualQuota < 0) return showToast("Annual quota cannot be negative");
    if (draft.carryForward < 0) return showToast("Carry forward cannot be negative");

    setRows((prev) => prev.map((r) => (r.id === draft.id ? { ...draft, code: draft.code.toUpperCase() } : r)));
    setEditingId(null);
    setDraft(null);
  }

  function addPolicy() {
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `lp-${Date.now()}`;
    const next: LeavePolicy = {
      id,
      name: "New Leave",
      code: "NEW",
      annualQuota: 0,
      carryForward: 0,
      accrualMode: "monthly",
      encashable: false,
      active: true,
    };
    setRows((prev) => [next, ...prev]);
    setEditingId(id);
    setDraft(next);
  }

  function deletePolicy(id: string) {
    if (editingId === id) {
      setEditingId(null);
      setDraft(null);
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function savePolicies() {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Company session not found. Please login again.");
    if (editingId) return showToast("Finish the current edit before saving.");

    setSaving(true);
    const response = await fetch("/api/company/settings/leaves", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ policies: rows }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; policies?: LeavePolicy[]; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return showToast(result.error || "Unable to save leave policies.");
    }
    setRows(Array.isArray(result.policies) ? result.policies : []);
    showToast("Leave policies saved.");
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Leave Policy</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Configure, edit, and maintain company leave policy rules with quota, carry-forward, and overrides.
        </p>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {toast}
        </div>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Total Leave Types</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{stats.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Active</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-700">{stats.active}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Inactive</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-rose-700">{stats.inactive}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Active Annual Quota</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{stats.totalQuota}</p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Leave Policy Definitions</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addPolicy}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Add Leave Type
            </button>
            <button
              type="button"
              onClick={savePolicies}
              disabled={saving || loading}
              className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Policies"}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Leave Name</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Code</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Annual Quota</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Carry Forward</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Accrual Mode</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Encashable</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Status</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isEditing = editingId === row.id && draft;
                const data = isEditing ? draft : row;
                if (!data) return null;

                return (
                  <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <input
                          value={data.name}
                          onChange={(e) => setField("name", e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        />
                      ) : (
                        <span className="font-semibold text-slate-900">{data.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <input
                          value={data.code}
                          onChange={(e) => setField("code", e.target.value.toUpperCase())}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        />
                      ) : (
                        data.code
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={data.annualQuota}
                          onChange={(e) => setField("annualQuota", Number(e.target.value || 0))}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        />
                      ) : (
                        data.annualQuota
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={data.carryForward}
                          onChange={(e) => setField("carryForward", Number(e.target.value || 0))}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        />
                      ) : (
                        data.carryForward
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <select
                          value={data.accrualMode}
                          onChange={(e) => setField("accrualMode", e.target.value === "upfront" ? "upfront" : "monthly")}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="upfront">Upfront (Year Start)</option>
                        </select>
                      ) : data.accrualMode === "upfront" ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                          Upfront
                        </span>
                      ) : (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          Monthly
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <select
                          value={data.encashable ? "yes" : "no"}
                          onChange={(e) => setField("encashable", e.target.value === "yes")}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : data.encashable ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          Yes
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <select
                          value={data.active ? "active" : "inactive"}
                          onChange={(e) => setField("active", e.target.value === "active")}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      ) : data.active ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      {isEditing ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePolicy(data.id)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePolicy(row.id)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No leave policies added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Employee Leave Balance Override</h2>
          <input
            type="number"
            min={2000}
            max={2100}
            value={overrideYear}
            onChange={(e) => setOverrideYear(Number(e.target.value || new Date().getFullYear()))}
            className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Use override to adjust accrued leave for exceptional cases (bonus/penalty). Applies to selected year only.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={overrideForm.employeeId}
            onChange={(e) => setOverrideForm((prev) => ({ ...prev, employeeId: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="">Select Employee</option>
            {overrideEmployees.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} ({row.employeeCode})
              </option>
            ))}
          </select>
          <select
            value={overrideForm.leavePolicyCode}
            onChange={(e) => setOverrideForm((prev) => ({ ...prev, leavePolicyCode: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="">Select Leave Type</option>
            {overridePolicies
              .filter((row) => row.active)
              .map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name} ({row.code})
                </option>
              ))}
          </select>
          <input
            type="number"
            step="0.5"
            placeholder="Extra Days (+/-)"
            value={overrideForm.extraDays}
            onChange={(e) => setOverrideForm((prev) => ({ ...prev, extraDays: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={saveOverride}
            disabled={overrideSaving}
            className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {overrideSaving ? "Saving..." : "Apply Override"}
          </button>
        </div>
        <textarea
          placeholder="Reason (5-300 chars)"
          value={overrideForm.reason}
          onChange={(e) => setOverrideForm((prev) => ({ ...prev, reason: e.target.value }))}
          className="mt-3 min-h-[72px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
        />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Employee</th>
                <th className="px-3 py-2 font-semibold">Leave Type</th>
                <th className="px-3 py-2 font-semibold">Year</th>
                <th className="px-3 py-2 font-semibold">Extra Days</th>
                <th className="px-3 py-2 font-semibold">Reason</th>
                <th className="px-3 py-2 font-semibold">Updated</th>
                <th className="px-3 py-2 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {overrideRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{row.employeeName}</div>
                    <div className="text-xs text-slate-500">{row.employeeCode}</div>
                  </td>
                  <td className="px-3 py-2">{row.leavePolicyCode}</td>
                  <td className="px-3 py-2">{row.year}</td>
                  <td className="px-3 py-2 font-semibold">{row.extraDays}</td>
                  <td className="px-3 py-2">{row.reason}</td>
                  <td className="px-3 py-2">
                    <div>{formatDisplayDateTime(row.updatedAt)}</div>
                    <div className="text-xs text-slate-500">{row.createdBy}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => deleteOverride(row.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {overrideRows.length === 0 && !overrideLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                    No overrides for {overrideYear}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
