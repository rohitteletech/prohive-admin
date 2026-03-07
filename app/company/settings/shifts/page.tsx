"use client";

import { useEffect, useMemo, useState } from "react";
import { CompanyEmployee, loadCompanyEmployees } from "@/lib/companyEmployees";
import {
  COMPANY_SHIFT_STORAGE_KEY,
  CompanyShift,
  loadCompanyShifts,
  saveCompanyShifts,
} from "@/lib/companyShifts";

type ShiftRow = CompanyShift;

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
      matched =
        activeRows.find((r) => normalizeText(r.name) === "general") ||
        activeRows[0] ||
        rows[0];
    }

    out[matched.id] = (out[matched.id] || 0) + 1;
  });

  return out;
}

export default function Page() {
  // Use deterministic initial rows to avoid SSR/client hydration mismatch.
  const [rows, setRows] = useState<ShiftRow[]>(() => loadCompanyShifts());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShiftRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [employees, setEmployees] = useState<CompanyEmployee[]>(() => loadCompanyEmployees());
  const [extraHoursPolicy, setExtraHoursPolicy] = useState<"yes" | "no">("yes");

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "phv_company_employees_v1" && e.key !== COMPANY_SHIFT_STORAGE_KEY) return;
      setEmployees(loadCompanyEmployees());
      if (!e.key || e.key === COMPANY_SHIFT_STORAGE_KEY) setRows(loadCompanyShifts());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    saveCompanyShifts(rows);
  }, [rows]);

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
    window.setTimeout(() => setToast(null), 1600);
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

    setRows((prev) => prev.map((r) => (r.id === draft.id ? draft : r)));
    setEditingId(null);
    setDraft(null);
    showToast("Shift updated");
  }

  function addShift() {
    const id = `s${Date.now()}`;
    const next: ShiftRow = {
      id,
      name: "New Shift",
      type: "Custom",
      start: "09:00",
      end: "18:00",
      graceMins: 10,
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
    showToast("Shift deleted");
  }

  function setField<K extends keyof ShiftRow>(key: K, value: ShiftRow[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Shift Control</h1>
        <p className="mt-2 text-sm text-zinc-600">Define, rename, and maintain shift type and timing rules for your company.</p>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {toast}
        </div>
      )}

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
            <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
              <span className="text-sm font-semibold text-slate-800">Extra Hr Policy</span>
              <select
                value={extraHoursPolicy}
                onChange={(e) => setExtraHoursPolicy(e.target.value as "yes" | "no")}
                className={[
                  "rounded-lg px-2 py-1 text-sm font-semibold outline-none",
                  extraHoursPolicy === "yes"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border border-amber-200 bg-amber-50 text-amber-800",
                ].join(" ")}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <button
              type="button"
              onClick={addShift}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Add Shift
            </button>
          </div>
        </div>

        <div className="mt-4">
          <table className="w-full table-fixed text-left">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Shift Name</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-center">Workforce</th>
                <th className="px-5 py-3 font-semibold whitespace-nowrap">Shift Type</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Start</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">End</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Working Hr</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Grace (Min)</th>
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
                    <td className="px-5 py-3 align-middle">
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
                    <td className="px-4 py-3 align-middle">
                      <span className="font-semibold text-slate-900">
                        {workingHoursLabel(data.start, data.end)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={data.graceMins}
                          onChange={(e) => setField("graceMins", Number(e.target.value || 0))}
                          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none"
                        />
                      ) : (
                        data.graceMins
                      )}
                    </td>
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
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No shifts configured yet. Click Add Shift to create your first shift.
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
