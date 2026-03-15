"use client";

import { useEffect, useMemo, useState } from "react";
import { LeaveRequestRow, LeaveRequestStatus } from "@/lib/companyLeaves";
import { formatDisplayDate, isoDateInIndia, todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function statusChip(status: LeaveRequestStatus) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "pending_manager") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (status === "pending_hr") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function statusLabel(status: LeaveRequestStatus) {
  if (status === "pending_manager") return "Pending Manager";
  if (status === "pending_hr") return "Pending HR";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function leaveModeLabel(mode: LeaveRequestRow["leaveMode"]) {
  if (mode === "mixed") return "Mixed";
  if (mode === "unpaid") return "Unpaid";
  return "Paid";
}

export default function Page() {
  const [today] = useState(() => todayISOInIndia());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | LeaveRequestStatus>("all");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadLeaveContext() {
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

      const leaveResponse = await fetch("/api/company/leaves", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const leaveResult = (await leaveResponse.json().catch(() => ({}))) as { rows?: LeaveRequestRow[]; error?: string };
      if (ignore) return;
      setLoading(false);
      if (!leaveResponse.ok) {
        setToast(leaveResult.error || "Unable to load leave requests.");
        return;
      }
      setRows(Array.isArray(leaveResult.rows) ? leaveResult.rows : []);
    }

    loadLeaveContext();
    return () => {
      ignore = true;
    };
  }, [today]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const statusOk = status === "all" ? true : r.status === status;
      const text = `${r.id} ${r.employee} ${r.employeeCode} ${r.reason} ${r.leaveTypeCode} ${r.leaveTypeName}`.toLowerCase();
      const searchOk = q ? text.includes(q) : true;
      const dateOk = date ? isoDateInIndia(r.submittedAt) === date : true;
      return statusOk && searchOk && dateOk;
    });
  }, [rows, search, status, date]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((r) => r.status === "pending" || r.status === "pending_manager" || r.status === "pending_hr").length;
    const approved = filtered.filter((r) => r.status === "approved").length;
    const rejected = filtered.filter((r) => r.status === "rejected").length;
    return { total, pending, approved, rejected };
  }, [filtered]);

  async function updateLeaveStatus(id: string, nextStatus: "approved" | "rejected") {
    const remark = window.prompt(
      nextStatus === "approved" ? "Approval remark (optional)" : "Rejection remark (optional)"
    );
    if (remark === null) return;

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Company session not found. Please login again.");

    setActionId(id);
    const response = await fetch(`/api/company/leaves/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        status: nextStatus,
        admin_remark: remark,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setActionId(null);
    if (!response.ok || !result.ok) {
      return showToast(result.error || "Unable to update leave request.");
    }

    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status: nextStatus, adminRemark: remark || undefined } : row))
    );
    showToast(nextStatus === "approved" ? "Leave approved." : "Leave rejected.");
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Leaves</h1>
        <p className="mt-2 text-sm text-zinc-600">Review leave requests and keep workforce planning under control.</p>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Total Requests</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{stats.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Pending</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-amber-700">{stats.pending}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Approved</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-700">{stats.approved}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Rejected</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-rose-700">{stats.rejected}</p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leave ID / employee / reason"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              const next = e.target.value;
              setDate(next > today ? today : next);
            }}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | LeaveRequestStatus)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="pending_manager">Pending Manager</option>
            <option value="pending_hr">Pending HR</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Selected date: {date ? formatDisplayDate(date) : "All dates"} (IST)</p>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Leave Queue</h2>
          <span className="text-xs text-slate-500">{filtered.length} requests</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-semibold">Leave ID</th>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Mode</th>
                <th className="px-5 py-3 font-semibold">From</th>
                <th className="px-5 py-3 font-semibold">To</th>
                <th className="px-5 py-3 font-semibold">Days</th>
                <th className="px-5 py-3 font-semibold">Reason</th>
                <th className="px-5 py-3 font-semibold">Submitted</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                  <td className="px-5 py-3 font-semibold text-slate-900">{row.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-5 py-3">
                    <div className="leading-tight">
                      <div className="font-semibold text-slate-900">{row.employee}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.employeeCode}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {leaveModeLabel(row.leaveMode)}
                    </span>
                  </td>
                  <td className="px-5 py-3">{row.fromDate}</td>
                  <td className="px-5 py-3">{row.toDate}</td>
                  <td className="px-5 py-3">
                    <div className="leading-tight">
                      <div className="font-semibold text-slate-900">{row.days}</div>
                      <div className="mt-0.5 text-xs text-slate-500">Paid {row.paidDays} | Unpaid {row.unpaidDays}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="max-w-[240px]">
                      <div>{row.reason}</div>
                      {row.adminRemark && <div className="mt-1 text-xs text-slate-500">Remark: {row.adminRemark}</div>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="leading-tight">
                      <div className="font-medium text-slate-900">{row.submittedDate}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.submittedTime}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold capitalize", statusChip(row.status)].join(" ")}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={actionId === row.id}
                          onClick={() => updateLeaveStatus(row.id, "approved")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                        >
                          {row.status === "pending_manager" ? "Manager Approve" : row.status === "pending_hr" ? "HR Approve" : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={actionId === row.id}
                          onClick={() => updateLeaveStatus(row.id, "rejected")}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Closed</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    No leave requests match current filters.
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
