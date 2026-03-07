"use client";

import { useEffect, useMemo, useState } from "react";
import { ClaimRow, ClaimStatus } from "@/lib/companyClaims";
import { loadCompanyEmployeesSupabase, type CompanyEmployee } from "@/lib/companyEmployees";
import { formatDisplayDate, isoDateInIndia, normalizeDateInputToIso, todayISOInIndia } from "@/lib/dateTime";
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
  const [todayDisplay] = useState(() => formatDisplayDate(todayIso));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ClaimStatus>("all");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [employees, setEmployees] = useState<CompanyEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    fromDate: todayDisplay,
    toDate: todayDisplay,
    claimType: "travel" as ClaimType,
    claimTypeOther: "",
    amount: "",
    reason: "",
    attachmentUrl: "",
  });

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

      const [claimResponse, employeeRows] = await Promise.all([
        fetch("/api/company/claims", {
          headers: { authorization: `Bearer ${accessToken}` },
        }),
        loadCompanyEmployeesSupabase(),
      ]);

      const claimResult = (await claimResponse.json().catch(() => ({}))) as { rows?: ClaimRow[]; error?: string };
      if (ignore) return;

      setLoading(false);
      if (!claimResponse.ok) {
        setToast(claimResult.error || "Unable to load claims.");
        return;
      }

      const activeEmployees = employeeRows.filter((row) => row.status === "active");
      setRows(Array.isArray(claimResult.rows) ? claimResult.rows : []);
      setEmployees(activeEmployees);
      setForm((prev) => ({
        ...prev,
        employeeId: prev.employeeId || activeEmployees[0]?.id || "",
      }));
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

  async function updateClaimStatus(id: string, nextStatus: "approved" | "rejected") {
    const remark = window.prompt(
      nextStatus === "approved" ? "Approval remark (optional)" : "Rejection remark (optional)"
    );
    if (remark === null) return;

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
  }

  async function createClaim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.employeeId) return showToast("Employee is required.");
    if (!form.fromDate) return showToast("From date is required.");
    if (!form.toDate) return showToast("To date is required.");
    if (!form.amount.trim()) return showToast("Amount is required.");
    if (!form.reason.trim()) return showToast("Reason is required.");
    if (form.claimType === "other" && !form.claimTypeOther.trim()) return showToast("Other claim type detail is required.");
    const fromDateIso = normalizeDateInputToIso(form.fromDate);
    const toDateIso = normalizeDateInputToIso(form.toDate);
    if (!fromDateIso) return showToast("From date is invalid. Use DD/MM/YYYY.");
    if (!toDateIso) return showToast("To date is invalid. Use DD/MM/YYYY.");
    if (fromDateIso > todayIso || toDateIso > todayIso) return showToast("Dates cannot be in the future.");
    if (toDateIso < fromDateIso) return showToast("To date cannot be before from date.");

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return showToast("Amount must be greater than zero.");

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Company session not found. Please login again.");

    setCreating(true);
    const response = await fetch("/api/company/claims", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        employee_id: form.employeeId,
        from_date: form.fromDate.trim(),
        to_date: form.toDate.trim(),
        claim_type: form.claimType,
        claim_type_other_text: form.claimType === "other" ? form.claimTypeOther.trim() : undefined,
        amount,
        reason: form.reason.trim(),
        attachment_url: form.attachmentUrl.trim() || undefined,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; row?: ClaimRow; error?: string };
    setCreating(false);
    if (!response.ok || !result.ok || !result.row) {
      return showToast(result.error || "Unable to create claim.");
    }

    setRows((prev) => [result.row as ClaimRow, ...prev]);
    setForm((prev) => ({
      ...prev,
      fromDate: todayDisplay,
      toDate: todayDisplay,
      claimTypeOther: "",
      amount: "",
      reason: "",
      attachmentUrl: "",
    }));
    showToast("Claim submitted.");
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-5 text-white">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-sky-100">COMPANY ADMIN</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Claims Approvals</h1>
          <p className="mt-2 text-sm text-sky-100">Review reimbursement claims quickly and keep approvals transparent.</p>
        </div>
      </section>

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
        <h2 className="text-base font-semibold text-slate-900">Create Claim</h2>
        <p className="mt-1 text-sm text-slate-600">Use this to add reimbursement requests for employees.</p>

        <form onSubmit={createClaim} className="mt-4 grid gap-3 lg:grid-cols-5">
          <select
            value={form.employeeId}
            onChange={(e) => setForm((prev) => ({ ...prev, employeeId: e.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          >
            {!employees.length && <option value="">No active employees</option>}
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} ({employee.employee_code})
              </option>
            ))}
          </select>
          <input
            type="text"
            value={form.fromDate}
            onChange={(e) => setForm((prev) => ({ ...prev, fromDate: e.target.value }))}
            placeholder="From (DD/MM/YYYY)"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
          <input
            type="text"
            value={form.toDate}
            onChange={(e) => setForm((prev) => ({ ...prev, toDate: e.target.value }))}
            placeholder="To (DD/MM/YYYY)"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
          <select
            value={form.claimType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                claimType: e.target.value as ClaimType,
                claimTypeOther: e.target.value === "other" ? prev.claimTypeOther : "",
              }))
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          >
            <option value="travel">Travel</option>
            <option value="meal">Meal</option>
            <option value="misc">Misc</option>
            <option value="other">Other</option>
          </select>
          {form.claimType === "other" && (
            <input
              type="text"
              value={form.claimTypeOther}
              onChange={(e) => setForm((prev) => ({ ...prev, claimTypeOther: e.target.value }))}
              placeholder="Other expense type"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
            />
          )}
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
            placeholder="Amount (INR)"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
          <button
            type="submit"
            disabled={creating || !employees.length}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {creating ? "Submitting..." : "Submit Claim"}
          </button>
          <input
            type="url"
            value={form.attachmentUrl}
            onChange={(e) => setForm((prev) => ({ ...prev, attachmentUrl: e.target.value }))}
            placeholder="Attachment URL (optional)"
            className="lg:col-span-5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
          <textarea
            value={form.reason}
            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder="Reason for claim"
            rows={3}
            className="lg:col-span-5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
        </form>
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
                          onClick={() => updateClaimStatus(row.id, "approved")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actionId === row.id}
                          onClick={() => updateClaimStatus(row.id, "rejected")}
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
    </div>
  );
}

