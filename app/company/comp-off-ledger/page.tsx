"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type LedgerRow = {
  employeeId: string;
  employee: string;
  employeeCode: string;
  department: string;
  earnedDays: number;
  manualAdjustmentDays: number;
  approvedUsed: number;
  pendingUsed: number;
  available: number;
  validityDays: number;
  recentEarnedDates: string[];
  overrideId: string;
  overrideReason: string;
  overrideUpdatedAt: string;
  overrideCreatedBy: string;
};

type LedgerSummary = {
  employees: number;
  earnedDays: number;
  manualAdjustmentDays: number;
  approvedUsed: number;
  pendingUsed: number;
  available: number;
};

type TransactionRow = {
  id: string;
  employeeId: string;
  employee: string;
  employeeCode: string;
  department: string;
  transactionDate: string;
  transactionDateLabel: string;
  kind: "Earned" | "Approved Use" | "Pending Use" | "Manual Adjustment";
  source: "Holiday" | "Weekly Off" | "Leave Request" | "Admin Override";
  days: number;
  note: string;
};

function readStoredCompanyId() {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("phv_company");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { id?: string | null };
    return parsed?.id || "";
  } catch {
    return "";
  }
}

export default function CompOffLedgerPage() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [summary, setSummary] = useState<LedgerSummary>({
    employees: 0,
    earnedDays: 0,
    manualAdjustmentDays: 0,
    approvedUsed: 0,
    pendingUsed: 0,
    available: 0,
  });
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [adjustmentForm, setAdjustmentForm] = useState({
    employeeId: "",
    extraDays: "",
    reason: "",
  });
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadLedger() {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token || "";
      const companyId = readStoredCompanyId();
      if (!accessToken) {
        if (!ignore) {
          setRows([]);
          setError("Company session not found. Please login again.");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/company/comp-off-ledger", {
          headers: {
            authorization: `Bearer ${accessToken}`,
            ...(companyId ? { "x-company-id": companyId } : {}),
          },
        });
        const json = (await response.json().catch(() => ({}))) as {
          rows?: LedgerRow[];
          summary?: LedgerSummary;
          transactions?: TransactionRow[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(json.error || "Unable to load comp off ledger.");
        }
        if (!ignore) {
          setRows(Array.isArray(json.rows) ? json.rows : []);
          setSummary(json.summary || { employees: 0, earnedDays: 0, manualAdjustmentDays: 0, approvedUsed: 0, pendingUsed: 0, available: 0 });
          setTransactions(Array.isArray(json.transactions) ? json.transactions : []);
        }
      } catch (err) {
        if (!ignore) {
          setRows([]);
          setTransactions([]);
          setError(err instanceof Error ? err.message : "Unable to load comp off ledger.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadLedger();
    return () => {
      ignore = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      `${row.employee} ${row.employeeCode} ${row.department}`.toLowerCase().includes(normalized),
    );
  }, [rows, query]);

  const filteredTransactions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return transactions;
    return transactions.filter((row) =>
      `${row.employee} ${row.employeeCode} ${row.department} ${row.kind} ${row.source} ${row.note}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [transactions, query]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function reloadLedger() {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token || "";
    const companyId = readStoredCompanyId();
    if (!accessToken) return;
    const response = await fetch("/api/company/comp-off-ledger", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(companyId ? { "x-company-id": companyId } : {}),
      },
    });
    const json = (await response.json().catch(() => ({}))) as {
      rows?: LedgerRow[];
      summary?: LedgerSummary;
      transactions?: TransactionRow[];
      error?: string;
    };
    if (!response.ok) throw new Error(json.error || "Unable to reload comp off ledger.");
    setRows(Array.isArray(json.rows) ? json.rows : []);
    setSummary(json.summary || { employees: 0, earnedDays: 0, manualAdjustmentDays: 0, approvedUsed: 0, pendingUsed: 0, available: 0 });
    setTransactions(Array.isArray(json.transactions) ? json.transactions : []);
  }

  async function saveAdjustment() {
    const employeeId = adjustmentForm.employeeId.trim();
    const extraDays = Number(adjustmentForm.extraDays);
    const reason = adjustmentForm.reason.trim();
    if (!employeeId) return showToast("Select employee for comp off adjustment.");
    if (!Number.isFinite(extraDays)) return showToast("Adjustment days must be numeric.");
    if (extraDays < -365 || extraDays > 365) return showToast("Adjustment days must be between -365 and 365.");
    if (reason.length < 5 || reason.length > 300) return showToast("Reason must be 5 to 300 characters.");

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token || "";
    if (!accessToken) return showToast("Company session not found. Please login again.");

    setAdjustmentSaving(true);
    try {
      const response = await fetch("/api/company/leaves/overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          employee_id: employeeId,
          leave_policy_code: "COMP-OFF",
          year: new Date().getFullYear(),
          extra_days: extraDays,
          reason,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || "Unable to save comp off adjustment.");
      setAdjustmentForm({ employeeId: "", extraDays: "", reason: "" });
      await reloadLedger();
      showToast("Comp off adjustment saved.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Unable to save comp off adjustment.");
    } finally {
      setAdjustmentSaving(false);
    }
  }

  async function removeAdjustment(id: string) {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token || "";
    if (!accessToken) return showToast("Company session not found. Please login again.");
    try {
      const response = await fetch(`/api/company/leaves/overrides/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || "Unable to remove comp off adjustment.");
      await reloadLedger();
      showToast("Comp off adjustment removed.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Unable to remove comp off adjustment.");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Comp Off Ledger</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Track company-wide comp off earned balances, approved usage, pending usage, and current available days.
        </p>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {toast}
        </div>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Employees</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{summary.employees}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Earned</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-indigo-700">{summary.earnedDays}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Manual Adjustment</p>
          <p className={`mt-1 text-3xl font-semibold tracking-tight ${summary.manualAdjustmentDays < 0 ? "text-rose-700" : "text-sky-700"}`}>
            {summary.manualAdjustmentDays}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Approved Used</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-amber-700">{summary.approvedUsed}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Pending Used</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-violet-700">{summary.pendingUsed}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Available</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-700">{summary.available}</p>
        </article>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Manual Adjustment</h2>
          <span className="text-xs text-slate-500">Use + / - days to grant or deduct comp off balance.</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            value={adjustmentForm.employeeId}
            onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, employeeId: e.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
          >
            <option value="">Select Employee</option>
            {rows.map((row) => (
              <option key={row.employeeId} value={row.employeeId}>
                {row.employee} ({row.employeeCode})
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.5"
            placeholder="Adjustment Days (+/-)"
            value={adjustmentForm.extraDays}
            onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, extraDays: e.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
          />
          <button
            type="button"
            onClick={saveAdjustment}
            disabled={adjustmentSaving}
            className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {adjustmentSaving ? "Saving..." : "Apply Adjustment"}
          </button>
        </div>
        <textarea
          value={adjustmentForm.reason}
          onChange={(e) => setAdjustmentForm((prev) => ({ ...prev, reason: e.target.value }))}
          placeholder="Reason (5-300 chars)"
          className="mt-3 min-h-[84px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none"
        />
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employee / employee code / department"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
        />
        <p className="mt-2 text-[11px] text-slate-500">
          Recent earned dates show the latest comp off eligible holiday or weekly-off worked dates inside the active validity window.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Comp Off Ledger</h2>
          <span className="text-xs text-slate-500">{loading ? "Loading..." : `${filtered.length} employees`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Department</th>
                <th className="px-5 py-3 font-semibold">Earned</th>
                <th className="px-5 py-3 font-semibold">Manual Adjustment</th>
                <th className="px-5 py-3 font-semibold">Approved Used</th>
                <th className="px-5 py-3 font-semibold">Pending Used</th>
                <th className="px-5 py-3 font-semibold">Available</th>
                <th className="px-5 py-3 font-semibold">Validity</th>
                <th className="px-5 py-3 font-semibold">Recent Earned Dates</th>
                <th className="px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && error && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-rose-600">
                    {error}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading comp off ledger...
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                filtered.map((row) => (
                  <tr key={row.employeeId} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                    <td className="px-5 py-3">
                      <div className="leading-tight">
                        <div className="font-semibold text-slate-900">{row.employee}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{row.employeeCode}</div>
                      </div>
                    </td>
                    <td className="px-5 py-3">{row.department}</td>
                    <td className="px-5 py-3 font-semibold text-indigo-700">{row.earnedDays}</td>
                    <td className={`px-5 py-3 font-semibold ${row.manualAdjustmentDays < 0 ? "text-rose-700" : "text-sky-700"}`}>
                      {row.manualAdjustmentDays}
                    </td>
                    <td className="px-5 py-3 font-semibold text-amber-700">{row.approvedUsed}</td>
                    <td className="px-5 py-3 font-semibold text-violet-700">{row.pendingUsed}</td>
                    <td className="px-5 py-3 font-semibold text-emerald-700">{row.available}</td>
                    <td className="px-5 py-3">{row.validityDays > 0 ? `${row.validityDays} days` : "-"}</td>
                    <td className="px-5 py-3">
                      {row.recentEarnedDates.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {row.recentEarnedDates.map((isoDate) => (
                            <span
                              key={`${row.employeeId}-${isoDate}`}
                              className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700"
                            >
                              {formatDisplayDate(isoDate)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No earned dates in current validity window</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAdjustmentForm({
                              employeeId: row.employeeId,
                              extraDays: row.manualAdjustmentDays ? String(row.manualAdjustmentDays) : "",
                              reason: row.overrideReason || "",
                            })
                          }
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Adjust
                        </button>
                        {row.overrideId ? (
                          <button
                            type="button"
                            onClick={() => removeAdjustment(row.overrideId)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      {row.overrideReason ? (
                        <div className="mt-2 text-xs text-slate-500">
                          {row.overrideReason}
                          {row.overrideCreatedBy ? ` • ${row.overrideCreatedBy}` : ""}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    No comp off ledger rows match current search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Transaction History</h2>
          <span className="text-xs text-slate-500">{loading ? "Loading..." : `${filteredTransactions.length} entries`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Department</th>
                <th className="px-5 py-3 font-semibold">Transaction</th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Days</th>
                <th className="px-5 py-3 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {!loading && error && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-rose-600">
                    {error}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading transaction history...
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                filteredTransactions.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                    <td className="px-5 py-3 font-medium text-slate-900">{row.transactionDateLabel}</td>
                    <td className="px-5 py-3">
                      <div className="leading-tight">
                        <div className="font-semibold text-slate-900">{row.employee}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{row.employeeCode}</div>
                      </div>
                    </td>
                    <td className="px-5 py-3">{row.department}</td>
                    <td className="px-5 py-3">
                      <span
                        className={[
                          "rounded-full border px-2.5 py-1 text-xs font-semibold",
                          row.kind === "Earned"
                            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                            : row.kind === "Approved Use"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : row.kind === "Pending Use"
                                ? "border-violet-200 bg-violet-50 text-violet-700"
                                : row.days < 0
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-sky-200 bg-sky-50 text-sky-700",
                        ].join(" ")}
                      >
                        {row.kind}
                      </span>
                    </td>
                    <td className="px-5 py-3">{row.source}</td>
                    <td className="px-5 py-3 font-semibold text-slate-900">{row.days}</td>
                    <td className="px-5 py-3">{row.note}</td>
                  </tr>
                ))}
              {!loading && !error && filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    No comp off transaction history found for current filters.
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
