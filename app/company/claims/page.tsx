"use client";

import { useEffect, useMemo, useState } from "react";
import ActionRemarkDialog from "@/components/company/action-remark-dialog";
import { ClaimRow, ClaimStatus } from "@/lib/companyClaims";
import { formatDisplayDate, isoDateInIndia, todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ClaimType = "travel" | "meal" | "misc" | "other";

function statusChip(status: ClaimStatus) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function typeLabel(type: ClaimType, otherText?: string) {
  if (type === "travel") return "Travel";
  if (type === "meal") return "Meal";
  if (type === "other") return otherText?.trim() ? `Other - ${otherText.trim()}` : "Other";
  return "Misc";
}

export default function Page() {
  const [todayIso] = useState(() => todayISOInIndia());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ClaimStatus>("all");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<ClaimRow[]>([]);
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

    async function loadClaims() {
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

      const claimResponse = await fetch("/api/company/claims", {
        headers: { authorization: `Bearer ${accessToken}` },
      });

      const claimResult = (await claimResponse.json().catch(() => ({}))) as { rows?: ClaimRow[]; error?: string };
      if (ignore) return;

      setLoading(false);
      if (!claimResponse.ok) {
        setToast(claimResult.error || "Unable to load claims.");
        return;
      }

      setRows(Array.isArray(claimResult.rows) ? claimResult.rows : []);
    }

    loadClaims();
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
    return rows.filter((r) => {
      const statusOk = status === "all" ? true : r.status === status;
      const text = `${r.id} ${r.employee} ${r.employeeCode} ${r.reason} ${r.claimType} ${r.claimTypeOther || ""}`.toLowerCase();
      const searchOk = q ? text.includes(q) : true;
      const dateOk = date ? isoDateInIndia(r.submittedAt) === date : true;
      return statusOk && searchOk && dateOk;
    });
  }, [rows, search, status, date]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((r) => r.status === "pending").length;
    const approved = filtered.filter((r) => r.status === "approved").length;
    const rejected = filtered.filter((r) => r.status === "rejected").length;
    const totalAmount = filtered.reduce((acc, r) => acc + r.amount, 0);
    const pendingAmount = filtered.filter((r) => r.status === "pending").reduce((acc, r) => acc + r.amount, 0);
    const approvedAmount = filtered.filter((r) => r.status === "approved").reduce((acc, r) => acc + r.amount, 0);
    const rejectedAmount = filtered.filter((r) => r.status === "rejected").reduce((acc, r) => acc + r.amount, 0);
    return { total, pending, approved, rejected, totalAmount, pendingAmount, approvedAmount, rejectedAmount };
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

  async function updateClaimStatus() {
    if (!pendingAction) return;
    const { id, nextStatus, remark } = pendingAction;

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Company session not found. Please login again.");

    setActionId(id);
    const response = await fetch(`/api/company/claims/${id}`, {
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
      return showToast(result.error || "Unable to update claim.");
    }

    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status: nextStatus, adminRemark: remark || undefined } : row))
    );
    showToast(nextStatus === "approved" ? "Claim approved." : "Claim rejected.");
    setPendingAction(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Claims</h1>
        <p className="mt-2 text-sm text-zinc-600">Review reimbursement claims quickly and keep approvals transparent.</p>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Total Claims</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{stats.total}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">INR {stats.totalAmount.toFixed(2)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Pending</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-amber-700">{stats.pending}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">INR {stats.pendingAmount.toFixed(2)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Approved</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-emerald-700">{stats.approved}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">INR {stats.approvedAmount.toFixed(2)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Rejected</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-rose-700">{stats.rejected}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">INR {stats.rejectedAmount.toFixed(2)}</p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search claim ID / employee / reason"
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
            onChange={(e) => setStatus(e.target.value as "all" | ClaimStatus)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Selected date: {date ? formatDisplayDate(date) : "All dates"} (IST)</p>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Claims Queue</h2>
          <span className="text-xs text-slate-500">{filtered.length} claims</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-semibold">Claim ID</th>
                <th className="px-5 py-3 font-semibold">Employee</th>
                <th className="px-5 py-3 font-semibold">Period</th>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Reason</th>
                <th className="px-5 py-3 font-semibold">Attachment</th>
                <th className="px-5 py-3 font-semibold">Submitted</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading claims...
                  </td>
                </tr>
              )}
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                  <td className="px-5 py-3 font-semibold text-slate-900">{row.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-5 py-3">
                    <div className="leading-tight">
                      <div className="font-semibold text-slate-900">{row.employee}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.employeeCode}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">{row.fromDate} - {row.toDate} ({row.days}d)</td>
                  <td className="px-5 py-3">{typeLabel(row.claimType, row.claimTypeOther)}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">INR {row.amount.toFixed(2)}</td>
                  <td className="px-5 py-3">
                    <div className="max-w-[240px]">
                      <div>{row.reason}</div>
                      {row.adminRemark && <div className="mt-1 text-xs text-slate-500">Remark: {row.adminRemark}</div>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {row.attachment ? (
                      <a
                        href={row.attachment}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">No Attachment</span>
                    )}
                  </td>
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
                        <button
                          type="button"
                          disabled={actionId === row.id}
                          onClick={() => openActionDialog(row.id, "approved")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                        >
                          Approve
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
                    ) : (
                      <span className="text-xs text-slate-500">Closed</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    No claims match current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ActionRemarkDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.nextStatus === "approved" ? "Approve Claim" : "Reject Claim"}
        description="Add an optional remark before saving this claim action."
        value={pendingAction?.remark || ""}
        error={pendingAction?.error || null}
        confirmLabel={pendingAction?.nextStatus === "approved" ? "Confirm Approval" : "Confirm Rejection"}
        saving={Boolean(actionId)}
        onChange={(value) =>
          setPendingAction((prev) => (prev ? { ...prev, remark: value, error: null } : prev))
        }
        onConfirm={updateClaimStatus}
        onCancel={closeActionDialog}
      />
    </div>
  );
}


