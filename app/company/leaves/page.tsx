"use client";

import { useEffect, useMemo, useState } from "react";
import { LeavePolicy, LeaveRequestRow, LeaveRequestStatus } from "@/lib/companyLeaves";
import { loadCompanyEmployeesSupabase, type CompanyEmployee } from "@/lib/companyEmployees";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function statusChip(status: LeaveRequestStatus) {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function Page() {
  const today = todayISO();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | LeaveRequestStatus>("all");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<LeaveRequestRow[]>([]);
  const [employees, setEmployees] = useState<CompanyEmployee[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    leavePolicyCode: "",
    fromDate: today,
    toDate: today,
    reason: "",
  });

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

      const [leaveResponse, policyResponse, employeeRows] = await Promise.all([
        fetch("/api/company/leaves", {
          headers: { authorization: `Bearer ${accessToken}` },
        }),
        fetch("/api/company/settings/leaves", {
          headers: { authorization: `Bearer ${accessToken}` },
        }),
        loadCompanyEmployeesSupabase(),
      ]);
      const leaveResult = (await leaveResponse.json().catch(() => ({}))) as { rows?: LeaveRequestRow[]; error?: string };
      const policyResult = (await policyResponse.json().catch(() => ({}))) as { policies?: LeavePolicy[]; error?: string };
      if (ignore) return;
      setLoading(false);
      if (!leaveResponse.ok) {
        setToast(leaveResult.error || "Unable to load leave requests.");
        return;
      }
      if (!policyResponse.ok) {
        setToast(policyResult.error || "Unable to load leave policies.");
        return;
      }
      const activePolicies = Array.isArray(policyResult.policies) ? policyResult.policies.filter((row) => row.active) : [];
      const activeEmployees = employeeRows.filter((row) => row.status === "active");
      setRows(Array.isArray(leaveResult.rows) ? leaveResult.rows : []);
      setPolicies(activePolicies);
      setEmployees(activeEmployees);
      setForm((prev) => ({
        employeeId: prev.employeeId || activeEmployees[0]?.id || "",
        leavePolicyCode: prev.leavePolicyCode || activePolicies[0]?.code || "",
        fromDate: prev.fromDate || today,
        toDate: prev.toDate || today,
        reason: prev.reason,
      }));
    }

    loadLeaveContext();
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
      const text = `${r.id} ${r.employee} ${r.employeeCode} ${r.reason} ${r.leaveTypeCode} ${r.leaveTypeName}`.toLowerCase();
      const searchOk = q ? text.includes(q) : true;
      const dateOk = date ? r.submittedAt.slice(0, 10) === date : true;
      return statusOk && searchOk && dateOk;
    });
  }, [rows, search, status, date]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((r) => r.status === "pending").length;
    const approved = filtered.filter((r) => r.status === "approved").length;
    const rejected = filtered.filter((r) => r.status === "rejected").length;
    const totalDays = filtered.reduce((acc, r) => acc + r.days, 0);
    return { total, pending, approved, rejected, totalDays };
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

  async function createLeaveRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.employeeId) return showToast("Employee is required.");
    if (!form.leavePolicyCode) return showToast("Leave type is required.");
    if (!form.fromDate) return showToast("From date is required.");
    if (!form.toDate) return showToast("To date is required.");
    if (form.toDate < form.fromDate) return showToast("To date cannot be before from date.");
    if (!form.reason.trim()) return showToast("Reason is required.");

    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Company session not found. Please login again.");

    setCreating(true);
    const response = await fetch("/api/company/leaves", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        employee_id: form.employeeId,
        leave_policy_code: form.leavePolicyCode,
        from_date: form.fromDate,
        to_date: form.toDate,
        reason: form.reason.trim(),
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; row?: LeaveRequestRow; error?: string };
    setCreating(false);
    if (!response.ok || !result.ok || !result.row) {
      return showToast(result.error || "Unable to create leave request.");
    }
    setRows((prev) => [result.row as LeaveRequestRow, ...prev]);
    setForm((prev) => ({
      ...prev,
      fromDate: today,
      toDate: today,
      reason: "",
    }));
    showToast("Leave request submitted.");
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-5 text-white">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-sky-100">COMPANY ADMIN</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Leave Approvals</h1>
          <p className="mt-2 text-sm text-sky-100">Review leave requests and keep workforce planning under control.</p>
        </div>
      </section>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-slate-600">Total Days</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{stats.totalDays}</p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Create Leave Request</h2>
            <p className="mt-1 text-sm text-slate-600">
              Use this for now to submit employee leave requests until mobile/apply flow is added.
            </p>
          </div>
        </div>

        <form onSubmit={createLeaveRequest} className="mt-4 grid gap-3 lg:grid-cols-5">
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
          <select
            value={form.leavePolicyCode}
            onChange={(e) => setForm((prev) => ({ ...prev, leavePolicyCode: e.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          >
            {!policies.length && <option value="">No active leave type</option>}
            {policies.map((policy) => (
              <option key={policy.id} value={policy.code}>
                {policy.name} ({policy.code})
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.fromDate}
            onChange={(e) => setForm((prev) => ({ ...prev, fromDate: e.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
          <input
            type="date"
            value={form.toDate}
            onChange={(e) => setForm((prev) => ({ ...prev, toDate: e.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none"
          />
          <button
            type="submit"
            disabled={creating || !employees.length || !policies.length}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {creating ? "Submitting..." : "Submit Request"}
          </button>
          <textarea
            value={form.reason}
            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder="Reason for leave"
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
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
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
                <th className="px-5 py-3 font-semibold">Type</th>
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
                    <div className="leading-tight">
                      <div className="font-medium text-slate-900">{row.leaveTypeName || row.leaveTypeCode}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{row.leaveTypeCode}</div>
                    </div>
                  </td>
                  <td className="px-5 py-3">{row.fromDate}</td>
                  <td className="px-5 py-3">{row.toDate}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{row.days}</td>
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
                      {row.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {row.status === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={actionId === row.id}
                          onClick={() => updateLeaveStatus(row.id, "approved")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                        >
                          Approve
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
