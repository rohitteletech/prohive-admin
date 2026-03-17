"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ManualReviewRow = {
  id: string;
  employeeId: string;
  localDate: string;
  employee: string;
  department: string;
  shift: string;
  date: string;
  checkIn: string;
  checkOut: string;
  workHours: string;
  status: "manual_review";
  nonWorkingDayTreatment?: string;
};

type ManualReviewSummary = {
  total: number;
  manualReview: number;
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

function currentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export default function ManualReviewsPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ManualReviewRow[]>([]);
  const [summary, setSummary] = useState<ManualReviewSummary>({ total: 0, manualReview: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [decisionById, setDecisionById] = useState<Record<string, string>>({});
  const [remarkById, setRemarkById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadQueue() {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token || "";
      const companyId = readStoredCompanyId();
      if (!accessToken) {
        if (!ignore) {
          setRows([]);
          setSummary({ total: 0, manualReview: 0 });
          setError("Company session not found. Please login again.");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/company/manual-reviews?monthKey=${encodeURIComponent(monthKey)}`, {
          headers: {
            authorization: `Bearer ${accessToken}`,
            ...(companyId ? { "x-company-id": companyId } : {}),
          },
        });
        const json = (await response.json().catch(() => ({}))) as {
          rows?: ManualReviewRow[];
          summary?: ManualReviewSummary;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(json.error || "Unable to load manual review queue.");
        }
        if (!ignore) {
          const nextRows = Array.isArray(json.rows) ? json.rows : [];
          setRows(nextRows);
          setSummary(json.summary || { total: 0, manualReview: 0 });
          setDecisionById((prev) => {
            const next = { ...prev };
            nextRows.forEach((row) => {
              if (!next[row.id]) next[row.id] = "Present + OT";
            });
            return next;
          });
        }
      } catch (err) {
        if (!ignore) {
          setRows([]);
          setSummary({ total: 0, manualReview: 0 });
          setError(err instanceof Error ? err.message : "Unable to load manual review queue.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadQueue();
    return () => {
      ignore = true;
    };
  }, [monthKey]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function resolveRow(row: ManualReviewRow, mode: "approve" | "reject") {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token || "";
    const companyId = readStoredCompanyId();
    if (!accessToken) return showToast("Company session not found. Please login again.");

    const resolutionTreatment = mode === "reject" ? "Record Only" : decisionById[row.id] || "Present + OT";
    const remark = (remarkById[row.id] || "").trim();
    if (mode === "approve" && !resolutionTreatment) return showToast("Select a treatment before approving.");
    if (remark && (remark.length < 5 || remark.length > 300)) return showToast("Remark must be 5 to 300 characters.");

    setSavingId(row.id);
    try {
      const response = await fetch("/api/company/manual-reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(companyId ? { "x-company-id": companyId } : {}),
        },
        body: JSON.stringify({
          employeeId: row.employeeId,
          workDate: row.localDate,
          resolutionTreatment,
          remark,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || "Unable to resolve manual review item.");
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      setSummary((prev) => ({ ...prev, manualReview: Math.max(prev.manualReview - 1, 0), total: Math.max(prev.total - 1, 0) }));
      showToast(mode === "reject" ? "Manual review rejected to Record Only." : "Manual review approved.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Unable to resolve manual review item.");
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      `${row.employee} ${row.department} ${row.shift} ${row.date} ${row.nonWorkingDayTreatment || ""}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [rows, query]);

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Manual Reviews</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Review holiday and weekly-off worked cases that are marked for manual decision under the current policy.
        </p>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {toast}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Queue Items</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-violet-700">{summary.manualReview}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">How To Use</p>
          <p className="mt-1 text-sm text-slate-700">
            Use this queue to approve the selected treatment or reject the case back to Record Only. Saved decisions immediately
            affect attendance reports, payroll treatment, and comp off logic.
          </p>
        </article>
      </section>

      <section className="mt-5 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee / department / treatment"
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 outline-none"
          />
          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value || currentMonthKey())}
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 outline-none"
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Queue shows only unresolved `Manual Review` cases produced by Holiday / Weekly Off policy treatment.
        </p>
      </section>

      <section className="mt-4 w-full rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Manual Review Queue</h2>
          <span className="text-xs text-slate-500">{loading ? "Loading..." : `${filtered.length} rows`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1320px] w-full table-fixed border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Employee</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Department</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Shift</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Date</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Check In</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Check Out</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Work Hours</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Treatment</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Remark</th>
                <th className="px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && error && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-[13px] text-rose-600">
                    {error}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-[13px] text-slate-500">
                    Loading manual review queue...
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 text-xs text-slate-700 hover:bg-slate-50 last:border-b-0">
                    <td className="border-r border-slate-200 px-3 py-2 font-semibold text-slate-900">{row.employee}</td>
                    <td className="border-r border-slate-200 px-3 py-2">{row.department}</td>
                    <td className="border-r border-slate-200 px-3 py-2">{row.shift}</td>
                    <td className="border-r border-slate-200 px-3 py-2">{row.date}</td>
                    <td className="border-r border-slate-200 px-3 py-2">{row.checkIn}</td>
                    <td className="border-r border-slate-200 px-3 py-2">{row.checkOut}</td>
                    <td className="border-r border-slate-200 px-3 py-2 font-semibold text-slate-900">{row.workHours}</td>
                    <td className="border-r border-slate-200 px-3 py-2">
                      <select
                        value={decisionById[row.id] || "Present + OT"}
                        onChange={(e) => setDecisionById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] text-slate-900 outline-none"
                      >
                        <option value="Record Only">Record Only</option>
                        <option value="OT Only">OT Only</option>
                        <option value="Grant Comp Off">Grant Comp Off</option>
                        <option value="Present + OT">Present + OT</option>
                      </select>
                    </td>
                    <td className="border-r border-slate-200 px-3 py-2">
                      <input
                        value={remarkById[row.id] || ""}
                        onChange={(e) => setRemarkById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="Optional remark"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] text-slate-900 outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingId === row.id}
                          onClick={() => resolveRow(row, "approve")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-60"
                        >
                          {savingId === row.id ? "Saving..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={savingId === row.id}
                          onClick={() => resolveRow(row, "reject")}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-[13px] text-slate-500">
                    No holiday or weekly-off manual review items found for the selected month.
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
