"use client";

import { useEffect, useMemo, useState } from "react";
import ActionRemarkDialog from "@/components/company/action-remark-dialog";
import { CorrectionRow, CorrectionStatus } from "@/lib/companyCorrections";
import { formatDisplayDate, todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function statusChip(status: CorrectionStatus) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "pending_hr") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "pending_manager") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function statusLabel(status: CorrectionStatus) {
  if (status === "pending_manager") return "Pending Manager";
  if (status === "pending_hr") return "Pending HR";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function auditActionLabel(action: string) {
  if (action === "submitted") return "Submitted";
  if (action === "reviewed") return "Reviewed";
  if (action === "auto_rejected") return "Auto Rejected";
  if (action === "blocked_monthly_limit") return "Blocked Monthly Limit";
  return action;
}

export default function Page() {
  const [todayIso] = useState(() => todayISOInIndia());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | CorrectionStatus>("all");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    id: string;
    nextStatus: "approved" | "rejected";
    remark: string;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadRows() {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token || "";
      if (!accessToken) {
        if (!ignore) {
          setLoading(false);
          setToast("Company session not found. Please login again.");
        }
        return;
      }

      const response = await fetch("/api/company/corrections", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json().catch(() => ({}))) as { rows?: CorrectionRow[]; error?: string };
      if (ignore) return;

      setLoading(false);
      if (!response.ok) {
        setToast(result.error || "Unable to load correction requests.");
        return;
      }
      setRows(Array.isArray(result.rows) ? result.rows : []);
    }

    loadRows();
    return () => {
      ignore = true;
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const statusOk =
        status === "all"
          ? true
          : status === "pending"
            ? row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr"
            : row.status === status;
      const dateOk = date ? row.correctionDateIso === date : true;
      const text = `${row.id} ${row.employee} ${row.employeeCode} ${row.reason} ${row.requestedIn} ${row.requestedOut}`.toLowerCase();
      const searchOk = q ? text.includes(q) : true;
      return statusOk && dateOk && searchOk;
    });
  }, [rows, search, status, date]);

  const queueRows = useMemo(
    () => filtered.filter((row) => row.status === "pending" || row.status === "pending_manager" || row.status === "pending_hr"),
    [filtered],
  );

  const historyRows = useMemo(
    () => filtered.filter((row) => row.status === "approved" || row.status === "rejected"),
    [filtered],
  );

  const stats = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((r) => r.status === "pending" || r.status === "pending_manager" || r.status === "pending_hr").length;
    const approved = filtered.filter((r) => r.status === "approved").length;
    const rejected = filtered.filter((r) => r.status === "rejected").length;
    return { total, pending, approved, rejected };
  }, [filtered]);

  function openActionDialog(id: string, nextStatus: "approved" | "rejected") {
    setPendingAction({
      id,
      nextStatus,
      remark: "",
      error: null,
    });
  }

  function closeActionDialog() {
    if (actionId) return;
    setPendingAction(null);
  }

  async function updateStatus() {
    if (!pendingAction) return;
    const { id, nextStatus, remark } = pendingAction;
    if (!remark.trim()) {
      setPendingAction((prev) => (prev ? { ...prev, error: "Admin remark is required." } : prev));
      return;
    }

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token || "";
    if (!accessToken) return showToast("Company session not found. Please login again.");

    setActionId(id);
    const response = await fetch(`/api/company/corrections/${id}`, {
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
      return showToast(result.error || "Unable to update correction request.");
    }

    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, status: (result as { status?: CorrectionStatus }).status || nextStatus, adminRemark: remark || undefined }
          : row,
      ),
    );
    showToast(
      nextStatus === "approved"
        ? (result as { status?: CorrectionStatus }).status === "pending_hr"
          ? "Manager approval recorded. Request moved to HR stage."
          : "Correction request approved."
        : "Correction request rejected.",
    );
    setPendingAction(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Attendance Corrections</h1>
        <p className="mt-2 text-sm text-zinc-600">Review and approve attendance correction requests with clear audit context.</p>
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
            max={todayIso}
            onChange={(e) => {
              const next = e.target.value;
              setDate(next > todayIso ? todayIso : next);
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
          <h2 className="text-base font-semibold text-slate-900">Correction Queue</h2>
          <span className="text-xs text-slate-500">{loading ? "Loading..." : `${queueRows.length} requests`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-semibold">Request ID</th>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Applied Policy</th>
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
              {loading && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading correction requests...
                  </td>
                </tr>
              )}
              {queueRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                  <td className="px-5 py-3 font-semibold text-slate-900">{row.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-5 py-3">
                    <div className="leading-tight">
                      <div className="font-semibold text-slate-900">{row.employee}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.employeeCode}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="leading-tight">
                      <div className="font-semibold text-slate-900">{row.policyName}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.policyCode} · {row.approvalMode}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">{row.correctionDate}</td>
                  <td className="px-5 py-3">{row.requestedIn}</td>
                  <td className="px-5 py-3">{row.requestedOut}</td>
                  <td className="px-5 py-3">
                    <div className="max-w-[260px]">
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
                    <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold", statusChip(row.status)].join(" ")}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        onClick={() => openActionDialog(row.id, "approved")}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                      >
                        {row.status === "pending_manager" ? "Manager Approve" : row.status === "pending_hr" ? "HR Approve" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={actionId === row.id}
                        onClick={() => openActionDialog(row.id, "rejected")}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && queueRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    No pending correction requests match current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Correction Action History</h2>
          <span className="text-xs text-slate-500">Recent request audit trail</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-semibold">Reviewed On</th>
                <th className="px-5 py-3 font-semibold">Request ID</th>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Action</th>
                <th className="px-5 py-3 font-semibold">Old Status</th>
                <th className="px-5 py-3 font-semibold">New Status</th>
                <th className="px-5 py-3 font-semibold">Performed By</th>
                <th className="px-5 py-3 font-semibold">Remark</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading correction history...
                  </td>
                </tr>
              )}
              {historyRows.flatMap((row) =>
                (row.auditLogs || []).map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                    <td className="px-5 py-3">{log.createdAt ? new Date(log.createdAt).toLocaleString("en-GB") : "-"}</td>
                    <td className="px-5 py-3 font-semibold text-slate-900">{row.id.slice(0, 8).toUpperCase()}</td>
                    <td className="px-5 py-3">{row.employee}</td>
                    <td className="px-5 py-3">{auditActionLabel(log.action)}</td>
                    <td className="px-5 py-3">{log.oldStatus || "-"}</td>
                    <td className="px-5 py-3">{log.newStatus || "-"}</td>
                    <td className="px-5 py-3">{log.performedBy || "-"}</td>
                    <td className="px-5 py-3">{log.remark || "-"}</td>
                  </tr>
                ))
              )}
              {!loading && historyRows.flatMap((row) => row.auditLogs || []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                    No correction action history available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ActionRemarkDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.nextStatus === "approved" ? "Approve Correction Request" : "Reject Correction Request"}
        description="Enter the required admin remark before saving this correction action."
        value={pendingAction?.remark || ""}
        error={pendingAction?.error || null}
        confirmLabel={pendingAction?.nextStatus === "approved" ? "Confirm Approval" : "Confirm Rejection"}
        saving={Boolean(actionId)}
        required
        minLength={1}
        onChange={(value) =>
          setPendingAction((prev) => (prev ? { ...prev, remark: value, error: null } : prev))
        }
        onConfirm={updateStatus}
        onCancel={closeActionDialog}
      />
    </div>
  );
}
