"use client";

import { useEffect, useMemo, useState } from "react";
import { CompanyEmployee, loadCompanyEmployees } from "@/lib/companyEmployees";
import { CompanyShift, DEFAULT_COMPANY_SHIFTS, loadCompanyShifts, saveCompanyShifts } from "@/lib/companyShifts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ShiftRow = CompanyShift;
type ExtraPolicyConfig = {
  halfDayMinWorkMins: number;
  gracePeriodAllowedMins: number;
  earlyInMins: number;
  minWorkOutMins: number;
};

const EXTRA_POLICY_STORAGE_KEY = "phv_company_extra_hr_policy_v1";

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function workingHoursLabel(start: string, end: string) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return "-";
  const mins = e >= s ? e - s : 24 * 60 - s + e;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${String(rem).padStart(2, "0")}m`;
}

function normalizeText(v: string) {
  return v.toLowerCase().replace(/\s+/g, " ").trim();
}

function computeWorkforceByShift(rows: ShiftRow[], employees: CompanyEmployee[]) {
  const out = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.id] = 0;
    return acc;
  }, {});

  if (!rows.length) return out;

  const activeRows = rows.filter((r) => r.active);
  const activeEmployees = employees.filter((e) => e.status === "active");

  activeEmployees.forEach((emp) => {
    const assignedShift = normalizeText(emp.shift_name || "");
    const designation = normalizeText(emp.designation || "");

    let matched = activeRows.find((r) => {
      const name = normalizeText(r.name);
      const type = normalizeText(r.type);
      if (assignedShift && (assignedShift === name || assignedShift === type)) return true;
      return (name && designation.includes(name)) || (type && designation.includes(type));
    });

    if (!matched) {
      matched = activeRows.find((r) => normalizeText(r.name) === "general") || activeRows[0] || rows[0];
    }

    out[matched.id] = (out[matched.id] || 0) + 1;
  });

  return out;
}

export default function Page() {
  const [rows, setRows] = useState<ShiftRow[]>(() => loadCompanyShifts());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShiftRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [employees, setEmployees] = useState<CompanyEmployee[]>(() => loadCompanyEmployees());
  const [extraHoursPolicy, setExtraHoursPolicy] = useState<"yes" | "no">("yes");
  const [showExtraPolicyWindow, setShowExtraPolicyWindow] = useState(false);
  const [extraPolicyDraft, setExtraPolicyDraft] = useState<ExtraPolicyConfig>({
    halfDayMinWorkMins: 240,
    gracePeriodAllowedMins: 10,
    earlyInMins: 15,
    minWorkOutMins: 60,
  });
  const [extraPolicyConfig, setExtraPolicyConfig] = useState<ExtraPolicyConfig>({
    halfDayMinWorkMins: 240,
    gracePeriodAllowedMins: 10,
    earlyInMins: 15,
    minWorkOutMins: 60,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadRows() {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) {
        if (!ignore) {
          setRows(loadCompanyShifts());
          setLoading(false);
          setToast("Company session not found. Showing last local shift copy.");
        }
        return;
      }

      const response = await fetch("/api/company/settings/shifts", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json().catch(() => ({}))) as {
        rows?: ShiftRow[];
        extraHoursPolicy?: "yes" | "no";
        error?: string;
      };
      if (ignore) return;
      setLoading(false);
      if (!response.ok) {
        setRows(loadCompanyShifts());
        setToast(result.error || "Unable to load shift settings. Showing last local shift copy.");
        return;
      }
      const nextRows = Array.isArray(result.rows) && result.rows.length ? result.rows : DEFAULT_COMPANY_SHIFTS;
      setRows(nextRows);
      saveCompanyShifts(nextRows);
      if (nextRows.length > 0) {
        const nextPolicy = {
          halfDayMinWorkMins: extraPolicyConfig.halfDayMinWorkMins,
          gracePeriodAllowedMins: nextRows[0].graceMins,
          earlyInMins: nextRows[0].earlyWindowMins,
          minWorkOutMins: nextRows[0].minWorkBeforeOutMins,
        };
        setExtraPolicyConfig(nextPolicy);
        setExtraPolicyDraft(nextPolicy);
        persistExtraPolicyConfig(nextPolicy);
      }
      if (result.extraHoursPolicy === "yes" || result.extraHoursPolicy === "no") {
        setExtraHoursPolicy(result.extraHoursPolicy);
      }
    }

    void loadRows();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EXTRA_POLICY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ExtraPolicyConfig>;
      const halfDayMinWorkMins = Number(parsed.halfDayMinWorkMins);
      const gracePeriodAllowedMins = Number(parsed.gracePeriodAllowedMins);
      const earlyInMins = Number(parsed.earlyInMins);
      const minWorkOutMins = Number(parsed.minWorkOutMins);
      if (Number.isFinite(halfDayMinWorkMins) && halfDayMinWorkMins >= 0 && halfDayMinWorkMins <= 1440) {
        const next = {
          halfDayMinWorkMins,
          gracePeriodAllowedMins:
            Number.isFinite(gracePeriodAllowedMins) && gracePeriodAllowedMins >= 0 && gracePeriodAllowedMins <= 120
              ? gracePeriodAllowedMins
              : 10,
          earlyInMins: Number.isFinite(earlyInMins) && earlyInMins >= 0 && earlyInMins <= 240 ? earlyInMins : 15,
          minWorkOutMins: Number.isFinite(minWorkOutMins) && minWorkOutMins >= 0 && minWorkOutMins <= 1440 ? minWorkOutMins : 60,
        };
        setExtraPolicyConfig(next);
        setExtraPolicyDraft(next);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "phv_company_employees_v1") return;
      setEmployees(loadCompanyEmployees());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const workforceByShift = useMemo(() => computeWorkforceByShift(rows, employees), [rows, employees]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.active).length;
    const inactive = rows.filter((r) => !r.active).length;
    const totalWorkforce = Object.values(workforceByShift).reduce((acc, n) => acc + n, 0);
    return { total, active, inactive, totalWorkforce };
  }, [rows, workforceByShift]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  function formatHourMinuteLabel(totalMins: number) {
    const safe = Number.isFinite(totalMins) ? Math.max(0, totalMins) : 0;
    const hrs = Math.floor(safe / 60);
    const mins = safe % 60;
    return `${hrs}h ${String(mins).padStart(2, "0")}m`;
  }

  function persistExtraPolicyConfig(next: ExtraPolicyConfig) {
    window.localStorage.setItem(EXTRA_POLICY_STORAGE_KEY, JSON.stringify(next));
  }

  function startEdit(row: ShiftRow) {
    setEditingId(row.id);
    setDraft({ ...row });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function saveEdit() {
    if (!draft) return;
    if (!draft.name.trim()) return showToast("Shift name is required");
    if (!draft.type.trim()) return showToast("Shift type is required");
    if (!draft.start || !draft.end) return showToast("Shift start/end time is required");

    const start = toMinutes(draft.start);
    const end = toMinutes(draft.end);
    if (start === null || end === null) return showToast("Invalid shift time format");
    if (start === end) return showToast("Start and End time cannot be same");
    if (draft.graceMins < 0 || draft.graceMins > 120) return showToast("Grace minutes must be between 0 and 120");
    if (draft.earlyWindowMins < 0 || draft.earlyWindowMins > 240) return showToast("Early window must be between 0 and 240");
    if (draft.minWorkBeforeOutMins < 0 || draft.minWorkBeforeOutMins > 1440) {
      return showToast("Min work before out must be between 0 and 1440");
    }

    setRows((prev) => prev.map((r) => (r.id === draft.id ? draft : r)));
    setEditingId(null);
    setDraft(null);
    showToast("Shift updated locally. Save Shifts to publish.");
  }

  function addShift() {
    const id = `s${Date.now()}`;
    const next: ShiftRow = {
      id,
      name: "New Shift",
      type: "Custom",
      start: "09:00",
      end: "18:00",
      graceMins: extraPolicyConfig.gracePeriodAllowedMins,
      earlyWindowMins: extraPolicyConfig.earlyInMins,
      minWorkBeforeOutMins: extraPolicyConfig.minWorkOutMins,
      active: true,
    };
    setRows((prev) => [next, ...prev]);
    setEditingId(id);
    setDraft(next);
  }

  function deleteShift(id: string) {
    if (editingId === id) {
      setEditingId(null);
      setDraft(null);
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    showToast("Shift removed locally. Save Shifts to publish.");
  }

  function setField<K extends keyof ShiftRow>(key: K, value: ShiftRow[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function saveExtraPolicyWindow() {
    if (extraPolicyDraft.halfDayMinWorkMins < 0 || extraPolicyDraft.halfDayMinWorkMins > 1440) {
      return showToast("Half day minimum work hours must be between 0 and 24 hours.");
    }
    if (extraPolicyDraft.gracePeriodAllowedMins < 0 || extraPolicyDraft.gracePeriodAllowedMins > 120) {
      return showToast("Grace period allowed must be between 0 and 120 minutes.");
    }
    if (extraPolicyDraft.earlyInMins < 0 || extraPolicyDraft.earlyInMins > 240) {
      return showToast("Early In must be between 0 and 240 minutes.");
    }
    if (extraPolicyDraft.minWorkOutMins < 0 || extraPolicyDraft.minWorkOutMins > 1440) {
      return showToast("Min Work Out must be between 0 and 1440 minutes.");
    }
    setExtraPolicyConfig(extraPolicyDraft);
    persistExtraPolicyConfig(extraPolicyDraft);
    setRows((current) =>
      current.map((row) => ({
        ...row,
        graceMins: extraPolicyDraft.gracePeriodAllowedMins,
        earlyWindowMins: extraPolicyDraft.earlyInMins,
        minWorkBeforeOutMins: extraPolicyDraft.minWorkOutMins,
      }))
    );
    setDraft((current) =>
      current
        ? {
            ...current,
            graceMins: extraPolicyDraft.gracePeriodAllowedMins,
            earlyWindowMins: extraPolicyDraft.earlyInMins,
            minWorkBeforeOutMins: extraPolicyDraft.minWorkOutMins,
          }
        : current
    );
    setShowExtraPolicyWindow(false);
    showToast("Extra HR policy settings applied to all shifts locally.");
  }

  async function persistRows(nextRows: ShiftRow[]) {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) {
      return showToast("Company session not found. Please login again.");
    }

    setSaving(true);
    const response = await fetch("/api/company/settings/shifts", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ rows: nextRows, extraHoursPolicy }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      rows?: ShiftRow[];
      extraHoursPolicy?: "yes" | "no";
      error?: string;
    };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return showToast(result.error || "Unable to save shifts.");
    }
    const savedRows = Array.isArray(result.rows) && result.rows.length ? result.rows : nextRows;
    setRows(savedRows);
    saveCompanyShifts(savedRows);
    persistExtraPolicyConfig(extraPolicyConfig);
    if (result.extraHoursPolicy === "yes" || result.extraHoursPolicy === "no") {
      setExtraHoursPolicy(result.extraHoursPolicy);
    }
    showToast("Shift settings saved.");
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Shift Control</h1>
        <p className="mt-2 text-sm text-zinc-600">Define, rename, and maintain shift type and timing rules for your company.</p>
        {loading && <p className="mt-2 text-sm text-zinc-500">Loading saved shift settings...</p>}
      </div>

      {toast && <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div>}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Total Shifts</p>
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
          <p className="text-xs font-semibold tracking-wide text-slate-600">Workforce</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{stats.totalWorkforce}</p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Shift Definitions</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setExtraPolicyDraft(extraPolicyConfig);
                setShowExtraPolicyWindow(true);
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Extra Hr Policy Control
            </button>
            <button
              type="button"
              onClick={addShift}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Add Shift
            </button>
            <button
              type="button"
              onClick={() => void persistRows(rows)}
              disabled={saving || loading}
              className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Shifts"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Extra Hr Policy</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{extraHoursPolicy === "yes" ? "Enabled" : "Disabled"}</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Half Day Minimum Working Hrs</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{formatHourMinuteLabel(extraPolicyConfig.halfDayMinWorkMins)}</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Grace Period Allowed</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{extraPolicyConfig.gracePeriodAllowedMins} min</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Early In</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{extraPolicyConfig.earlyInMins} min</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Min Work Out</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{extraPolicyConfig.minWorkOutMins} min</div>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Policy Window</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">Editable</div>
          </article>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-left">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Shift Name</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Workforce</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Shift Type</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Start</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">End</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Working Hr</th>
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
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        />
                      ) : (
                        <span className="block truncate font-semibold text-slate-900">{data.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-center">
                      <span className="font-semibold text-slate-900">{workforceByShift[row.id] || 0}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <input
                          value={data.type}
                          onChange={(e) => setField("type", e.target.value)}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        />
                      ) : (
                        <span className="block truncate">{data.type}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <input
                          type="time"
                          value={data.start}
                          onChange={(e) => setField("start", e.target.value)}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none"
                        />
                      ) : (
                        data.start
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <input
                          type="time"
                          value={data.end}
                          onChange={(e) => setField("end", e.target.value)}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none"
                        />
                      ) : (
                        data.end
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle font-semibold text-slate-900">{workingHoursLabel(data.start, data.end)}</td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <select
                          value={data.active ? "active" : "inactive"}
                          onChange={(e) => setField("active", e.target.value === "active")}
                          className="w-full min-w-[92px] rounded-lg border border-slate-300 bg-white px-2 py-2 outline-none"
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
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteShift(data.id)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
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
                            onClick={() => deleteShift(row.id)}
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
              {rows.length === 0 && (
                <tr className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No shifts configured yet. Click Add Shift to create your first shift.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showExtraPolicyWindow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Extra Hr Policy Control</h3>
                <p className="mt-1 text-sm text-slate-600">Configure extra-hour approval behavior and half-day minimum work rules.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExtraPolicyWindow(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Extra Hr Policy</span>
                <select
                  value={extraHoursPolicy}
                  onChange={(e) => setExtraHoursPolicy(e.target.value as "yes" | "no")}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Half Day Minimum Working Hrs</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={extraPolicyDraft.halfDayMinWorkMins / 60}
                  onChange={(e) => {
                    const hours = Number(e.target.value || 0);
                    setExtraPolicyDraft((prev) => ({
                      ...prev,
                      halfDayMinWorkMins: Math.round(Math.max(0, hours) * 60),
                    }));
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Grace Period Allowed</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={extraPolicyDraft.gracePeriodAllowedMins}
                  onChange={(e) =>
                    setExtraPolicyDraft((prev) => ({
                      ...prev,
                      gracePeriodAllowedMins: Number(e.target.value || 0),
                    }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Early In</span>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={extraPolicyDraft.earlyInMins}
                  onChange={(e) =>
                    setExtraPolicyDraft((prev) => ({
                      ...prev,
                      earlyInMins: Number(e.target.value || 0),
                    }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-slate-700">Min Work Out</span>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={extraPolicyDraft.minWorkOutMins}
                  onChange={(e) =>
                    setExtraPolicyDraft((prev) => ({
                      ...prev,
                      minWorkOutMins: Number(e.target.value || 0),
                    }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <div>
                Current half-day threshold: <span className="font-semibold">{formatHourMinuteLabel(extraPolicyDraft.halfDayMinWorkMins)}</span>
              </div>
              <div className="mt-1">
                Grace period allowed: <span className="font-semibold">{extraPolicyDraft.gracePeriodAllowedMins} min</span>
              </div>
              <div className="mt-1">
                Early In: <span className="font-semibold">{extraPolicyDraft.earlyInMins} min</span>
              </div>
              <div className="mt-1">
                Min Work Out: <span className="font-semibold">{extraPolicyDraft.minWorkOutMins} min</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExtraPolicyWindow(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveExtraPolicyWindow}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Save Policy Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
