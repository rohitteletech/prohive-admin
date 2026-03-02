"use client";

import { useMemo, useState } from "react";

type CorrectionStatus = "pending" | "approved" | "rejected";

type CorrectionRow = {
  id: string;
  employee: string;
  date: string;
  requestedIn: string;
  requestedOut: string;
  reason: string;
  submittedDate: string;
  submittedTime: string;
  status: CorrectionStatus;
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function statusChip(status: CorrectionStatus) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function Page() {
  const today = todayISO();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CorrectionStatus>("all");
  const [date, setDate] = useState(today);

  const rows = useMemo<CorrectionRow[]>(() => [], []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const statusOk = status === "all" ? true : r.status === status;
      const text = `${r.id} ${r.employee} ${r.reason}`.toLowerCase();
      const searchOk = q ? text.includes(q) : true;
      return statusOk && searchOk;
    });
  }, [rows, search, status]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((r) => r.status === "pending").length;
    const approved = filtered.filter((r) => r.status === "approved").length;
    const rejected = filtered.filter((r) => r.status === "rejected").length;
    return { total, pending, approved, rejected };
  }, [filtered]);

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-5 text-white">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-sky-100">COMPANY ADMIN</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Attendance Corrections</h1>
          <p className="mt-2 text-sm text-sky-100">
            Review and approve attendance correction requests with clear audit context.
          </p>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Total Requests</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{stats.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Pending Review</p>
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
            placeholder="Search request / employee / reason"
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
            onChange={(e) => setStatus(e.target.value as "all" | CorrectionStatus)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Correction Queue</h2>
          <span className="text-xs text-slate-500">{filtered.length} requests</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-semibold">Request ID</th>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Date</th>
                <th className="px-5 py-3 font-semibold">Requested In</th>
                <th className="px-5 py-3 font-semibold">Requested Out</th>
                <th className="px-5 py-3 font-semibold">Reason</th>
                <th className="px-5 py-3 font-semibold">Submitted</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                  <td className="px-5 py-3 font-semibold text-slate-900">{row.id}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{row.employee}</td>
                  <td className="px-5 py-3">{row.date}</td>
                  <td className="px-5 py-3">{row.requestedIn}</td>
                  <td className="px-5 py-3">{row.requestedOut}</td>
                  <td className="px-5 py-3">{row.reason}</td>
                  <td className="px-5 py-3">
                    <div className="leading-tight">
                      <div className="font-medium text-slate-900">{row.submittedDate}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.submittedTime}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold capitalize", statusChip(row.status)].join(" ")}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {row.status === "pending" ? (
                      <div className="flex gap-2">
                        <button className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          Approve
                        </button>
                        <button className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Closed</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">
                    No correction requests match current filters.
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
