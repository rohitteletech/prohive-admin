"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ManualReviewRow = {
  id: string;
  caseType: string;
  caseTypeLabel: string;
  title: string;
  employeeId: string;
  employee: string;
  department: string;
  sourceId: string;
  sourceTable: string;
  punchType: string;
  punchAt: string;
  workDate: string;
  addressText: string;
  isOffline: boolean;
  approvalStatus: string;
  reasonCodes: string[];
  suggestedTreatment: string;
  workHours: string;
  dayTypeLabel: string;
  workflowHint: string;
  createdAt: string;
};

type ManualReviewSummary = {
  total: number;
  pending: number;
  offlinePunchReview: number;
  approvedLeavePunchReview: number;
  holidayWorkedReview: number;
  weeklyOffWorkedReview: number;
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
  const [summary, setSummary] = useState<ManualReviewSummary>({
    total: 0,
    pending: 0,
    offlinePunchReview: 0,
    approvedLeavePunchReview: 0,
    holidayWorkedReview: 0,
    weeklyOffWorkedReview: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [treatmentById, setTreatmentById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
          setSummary({ total: 0, pending: 0, offlinePunchReview: 0, approvedLeavePunchReview: 0, holidayWorkedReview: 0, weeklyOffWorkedReview: 0 });
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
        if (!response.ok) throw new Error(json.error || "Unable to load manual review queue.");
        if (!ignore) {
          setRows(Array.isArray(json.rows) ? json.rows : []);
          setSummary(
            json.summary || {
              total: 0,
              pending: 0,
              offlinePunchReview: 0,
              approvedLeavePunchReview: 0,
              holidayWorkedReview: 0,
              weeklyOffWorkedReview: 0,
            }
          );
        }
      } catch (err) {
        if (!ignore) {
          setRows([]);
          setSummary({ total: 0, pending: 0, offlinePunchReview: 0, approvedLeavePunchReview: 0, holidayWorkedReview: 0, weeklyOffWorkedReview: 0 });
          setError(err instanceof Error ? err.message : "Unable to load manual review queue.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadQueue();
    return () => {
      ignore = true;
    };
  }, [monthKey, reloadKey]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  async function resolveRow(row: ManualReviewRow, action: "approve" | "reject") {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token || "";
    const companyId = readStoredCompanyId();
    if (!accessToken) return showToast("Company session not found. Please login again.");

    const reviewNote = (noteById[row.id] || "").trim();
    if (reviewNote.length < 5 || reviewNote.length > 300) {
      return showToast("Review note must be 5 to 300 characters.");
    }

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
          caseId: row.id,
          action,
          reviewNote,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || "Unable to resolve manual review case.");
      setReloadKey((prev) => prev + 1);
      showToast(
        action === "approve"
          ? "Punch review saved. Follow-up treatment case appears automatically if the date is holiday or weekly off."
          : "Punch rejected from manual review."
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Unable to resolve manual review case.");
    } finally {
      setSavingId(null);
    }
  }

  async function resolveTreatmentRow(row: ManualReviewRow) {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token || "";
    const companyId = readStoredCompanyId();
    if (!accessToken) return showToast("Company session not found. Please login again.");

    const reviewNote = (noteById[row.id] || "").trim();
    const resolutionTreatment = treatmentById[row.id] || row.suggestedTreatment || "Record Only";
    if (reviewNote.length < 5 || reviewNote.length > 300) {
      return showToast("Review note must be 5 to 300 characters.");
    }

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
          caseId: row.id,
          action: "resolve",
          reviewNote,
          resolutionTreatment,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || "Unable to resolve manual review case.");
      setReloadKey((prev) => prev + 1);
      showToast("Manual review treatment saved.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Unable to resolve manual review case.");
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      `${row.employee} ${row.department} ${row.caseTypeLabel} ${row.punchType} ${row.reasonCodes.join(" ")} ${row.workDate}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [rows, query]);

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Manual Reviews</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Review pending offline punch, approved-leave punch, and holiday or weekly-off worked cases in one queue.
        </p>
      </div>

      {toast ? <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Pending Cases</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-violet-700">{summary.pending}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Offline Punch</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-sky-700">{summary.offlinePunchReview}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Approved Leave Punch</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-amber-700">{summary.approvedLeavePunchReview}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Holiday / Weekly Off</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-emerald-700">
            {summary.holidayWorkedReview + summary.weeklyOffWorkedReview}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">How To Use</p>
          <p className="mt-1 text-sm text-slate-700">Step 1 reviews punch validity. Step 2 selects holiday or weekly-off treatment when needed.</p>
        </article>
      </section>

      <section className="mt-5 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee / department / reason"
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 outline-none"
          />
          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value || currentMonthKey())}
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 outline-none"
          />
        </div>
      </section>

      <section className="mt-4 w-full rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Manual Review Queue</h2>
          <span className="text-xs text-slate-500">{loading ? "Loading..." : `${filtered.length} rows`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1620px] w-full table-fixed border-separate border-spacing-0 text-left">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Case</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Employee</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Department</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Punch Type</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Punch At / Work Date</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Network</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Flow</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Reasons</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Address</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Treatment</th>
                <th className="border-r border-slate-200 px-3 py-2 font-semibold">Review Note</th>
                <th className="px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && error ? (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-[13px] text-rose-600">
                    {error}
                  </td>
                </tr>
              ) : null}
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-[13px] text-slate-500">
                    Loading manual review queue...
                  </td>
                </tr>
              ) : null}
              {!loading && !error
                ? filtered.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 text-xs text-slate-700 hover:bg-slate-50 last:border-b-0">
                      <td className="border-r border-slate-200 px-3 py-2">
                        <div className="font-semibold text-slate-900">{row.caseTypeLabel}</div>
                        <div className="text-[11px] text-slate-500">{row.title}</div>
                        {row.dayTypeLabel ? <div className="text-[11px] text-slate-500">{row.dayTypeLabel}</div> : null}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2 font-semibold text-slate-900">{row.employee}</td>
                      <td className="border-r border-slate-200 px-3 py-2">{row.department}</td>
                      <td className="border-r border-slate-200 px-3 py-2 uppercase">{row.punchType || "-"}</td>
                      <td className="border-r border-slate-200 px-3 py-2">
                        {row.caseType === "holiday_worked_review" || row.caseType === "weekly_off_worked_review"
                          ? (
                            <div className="space-y-1">
                              <div>{row.workDate || "-"}</div>
                              <div className="text-[11px] text-slate-500">Worked: {row.workHours || "-"}</div>
                            </div>
                          )
                          : row.punchAt
                            ? new Date(row.punchAt).toLocaleString("en-GB")
                            : "-"}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2">
                        {row.caseType === "holiday_worked_review" || row.caseType === "weekly_off_worked_review"
                          ? row.caseType === "holiday_worked_review"
                            ? "Holiday"
                            : "Weekly Off"
                          : row.isOffline
                            ? "Offline"
                            : "Online"}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2">
                        <span className="text-[11px] text-slate-600">{row.workflowHint || "-"}</span>
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2">{row.reasonCodes.length > 0 ? row.reasonCodes.join(", ") : "-"}</td>
                      <td className="border-r border-slate-200 px-3 py-2">{row.addressText || "-"}</td>
                      <td className="border-r border-slate-200 px-3 py-2">
                        {row.caseType === "holiday_worked_review" || row.caseType === "weekly_off_worked_review" ? (
                          <select
                            value={treatmentById[row.id] || row.suggestedTreatment || "Record Only"}
                            onChange={(e) => setTreatmentById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] text-slate-900 outline-none"
                          >
                            <option value="Record Only">Record Only</option>
                            <option value="OT Only">OT Only</option>
                            <option value="Grant Comp Off">Grant Comp Off</option>
                            <option value="Present + OT">Present + OT</option>
                          </select>
                        ) : (
                          <span className="text-[11px] text-slate-500">Approve / Reject</span>
                        )}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2">
                        <input
                          value={noteById[row.id] || ""}
                          onChange={(e) => setNoteById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          placeholder="Write review note"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] text-slate-900 outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {row.caseType === "holiday_worked_review" || row.caseType === "weekly_off_worked_review" ? (
                          <button
                            type="button"
                            disabled={savingId === row.id}
                            onClick={() => resolveTreatmentRow(row)}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 disabled:opacity-60"
                          >
                            {savingId === row.id ? "Saving..." : "Save Treatment"}
                          </button>
                        ) : (
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
                        )}
                      </td>
                    </tr>
                  ))
                : null}
              {!loading && !error && filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-[13px] text-slate-500">
                    No pending manual review cases found for the selected month.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
