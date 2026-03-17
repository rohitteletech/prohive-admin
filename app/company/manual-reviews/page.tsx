"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ManualReviewRow = {
  id: string;
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
          setRows(Array.isArray(json.rows) ? json.rows : []);
          setSummary(json.summary || { total: 0, manualReview: 0 });
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Queue Items</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-violet-700">{summary.manualReview}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">How To Use</p>
          <p className="mt-1 text-sm text-slate-700">
            Use this queue to identify worked non-working-day cases that need HR/Admin judgement. Final operational resolution can
            be handled from the attendance workflow until a dedicated approval action is added.
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
          Queue shows only `Manual Review` cases produced by Holiday / Weekly Off policy treatment.
        </p>
      </section>

      <section className="mt-4 w-full rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Manual Review Queue</h2>
          <span className="text-xs text-slate-500">{loading ? "Loading..." : `${filtered.length} rows`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full table-fixed border-separate border-spacing-0 text-left">
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
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {!loading && error && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-[13px] text-rose-600">
                    {error}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-[13px] text-slate-500">
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
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                        {row.nonWorkingDayTreatment || "Manual Review"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                        Manual Review
                      </span>
                    </td>
                  </tr>
                ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-[13px] text-slate-500">
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
