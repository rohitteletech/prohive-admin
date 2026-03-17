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
  approvedUsed: number;
  pendingUsed: number;
  available: number;
  validityDays: number;
  recentEarnedDates: string[];
};

type LedgerSummary = {
  employees: number;
  earnedDays: number;
  approvedUsed: number;
  pendingUsed: number;
  available: number;
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
    approvedUsed: 0,
    pendingUsed: 0,
    available: 0,
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          error?: string;
        };
        if (!response.ok) {
          throw new Error(json.error || "Unable to load comp off ledger.");
        }
        if (!ignore) {
          setRows(Array.isArray(json.rows) ? json.rows : []);
          setSummary(json.summary || { employees: 0, earnedDays: 0, approvedUsed: 0, pendingUsed: 0, available: 0 });
        }
      } catch (err) {
        if (!ignore) {
          setRows([]);
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

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Comp Off Ledger</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Track company-wide comp off earned balances, approved usage, pending usage, and current available days.
        </p>
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Employees</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{summary.employees}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Earned</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-indigo-700">{summary.earnedDays}</p>
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
                <th className="px-5 py-3 font-semibold">Approved Used</th>
                <th className="px-5 py-3 font-semibold">Pending Used</th>
                <th className="px-5 py-3 font-semibold">Available</th>
                <th className="px-5 py-3 font-semibold">Validity</th>
                <th className="px-5 py-3 font-semibold">Recent Earned Dates</th>
              </tr>
            </thead>
            <tbody>
              {!loading && error && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-rose-600">
                    {error}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
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
                  </tr>
                ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                    No comp off ledger rows match current search.
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
