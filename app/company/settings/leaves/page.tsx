"use client";

import { useEffect, useMemo, useState } from "react";
import { LeavePolicy } from "@/lib/companyLeaves";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function Page() {
  const [rows, setRows] = useState<LeavePolicy[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeavePolicy | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      setRows(Array.isArray(result.policies) ? result.policies : []);
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
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-5 text-white">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-sky-100">COMPANY ADMIN SETTINGS</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Leave Control</h1>
          <p className="mt-2 text-sm text-sky-100">
            Configure, edit, and maintain company leave policies with quota and carry-forward rules.
          </p>
        </div>
      </section>

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
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    No leave policies added yet.
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
