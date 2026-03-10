"use client";

import { useMemo, useState } from "react";
import { formatDisplayDate, INDIA_TIME_ZONE, todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ReportKey = "attendance" | "leaves" | "claims" | "corrections";
type DateMode = "monthly" | "date_range";

type MonthOption = {
  key: string;
  label: string;
  startISO: string;
  endISO: string;
};

type ReportCard = {
  key: ReportKey;
  title: string;
  category: string;
  description: string;
  status: "ready_next" | "planned";
  primaryMetric: string;
  primaryLabel: string;
  exports: string[];
  includes: string[];
};

type AttendancePreviewRow = {
  id: string;
  employee: string;
  department: string;
  shift: string;
  date: string;
  checkIn: string;
  checkOut: string;
  workHours: string;
  status: "present" | "late" | "absent";
};

type AttendanceSummary = {
  total: number;
  present: number;
  late: number;
  absent: number;
};

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getMonthBounds(y: number, mIndex: number) {
  const start = new Date(y, mIndex, 1);
  const end = new Date(y, mIndex + 1, 0);
  return { startISO: toISODate(start), endISO: toISODate(end) };
}

function buildLast3CompleteMonths(today: Date): MonthOption[] {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const out: MonthOption[] = [];

  for (let i = 3; i >= 1; i -= 1) {
    const d = new Date(firstDayCurrentMonth);
    d.setMonth(firstDayCurrentMonth.getMonth() - i);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const { startISO, endISO } = getMonthBounds(y, m);
    out.push({
      key,
      label: `${monthNames[m]} ${y}`,
      startISO,
      endISO,
    });
  }
  return out;
}

function statusBadge(status: ReportCard["status"]) {
  if (status === "ready_next") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function statusLabel(status: ReportCard["status"]) {
  return status === "ready_next" ? "Build Next" : "Planned";
}

function attendanceStatusChip(status: AttendancePreviewRow["status"]) {
  if (status === "present") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "late") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

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

export default function Page() {
  const today = useMemo(() => new Date(`${todayISOInIndia()}T00:00:00+05:30`), []);
  const yesterday = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d;
  }, [today]);
  const yesterdayISO = useMemo(() => toISODate(yesterday), [yesterday]);
  const monthOptions = useMemo(() => buildLast3CompleteMonths(today), [today]);
  const defaultMonth = monthOptions[monthOptions.length - 1] || monthOptions[0];
  const firstAvailableDate = "2025-11-01";

  const reports = useMemo<ReportCard[]>(
    () => [
      {
        key: "attendance",
        title: "Attendance Reports",
        category: "Operations",
        description: "Daily and monthly attendance reporting for payroll support, late marks, and work hours review.",
        status: "ready_next",
        primaryMetric: "01",
        primaryLabel: "Highest priority",
        exports: ["CSV", "XLSX"],
        includes: ["Present / Late / Absent", "Check-in / Check-out", "Work hours", "Shift-wise filters"],
      },
      {
        key: "leaves",
        title: "Leave Reports",
        category: "HR",
        description: "Leave balance, approvals, pending requests, and policy-wise leave usage summaries.",
        status: "planned",
        primaryMetric: "02",
        primaryLabel: "After attendance",
        exports: ["CSV", "XLSX"],
        includes: ["Leave balance", "Approved / Pending", "Policy-wise usage", "Employee-wise summary"],
      },
      {
        key: "claims",
        title: "Claims Reports",
        category: "Finance Support",
        description: "Claims register with amount, type, approval status, and processing turnaround tracking.",
        status: "planned",
        primaryMetric: "03",
        primaryLabel: "Phase two",
        exports: ["CSV", "PDF"],
        includes: ["Claim type", "Amount", "Approval status", "Submitted / reviewed dates"],
      },
      {
        key: "corrections",
        title: "Corrections Audit",
        category: "Compliance",
        description: "Attendance correction audit trail for manager review, remark visibility, and approval tracking.",
        status: "planned",
        primaryMetric: "04",
        primaryLabel: "Phase two",
        exports: ["CSV", "PDF"],
        includes: ["Requested change", "Approval status", "Admin remark", "Audit-ready history"],
      },
    ],
    []
  );

  const [selectedReport, setSelectedReport] = useState<ReportKey>("attendance");
  const [dateMode, setDateMode] = useState<DateMode>("monthly");
  const [monthKey, setMonthKey] = useState(defaultMonth?.key || "");
  const [startDate, setStartDate] = useState(firstAvailableDate);
  const [endDate, setEndDate] = useState(yesterdayISO);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [previewRows, setPreviewRows] = useState<AttendancePreviewRow[]>([]);
  const [previewSummary, setPreviewSummary] = useState<AttendanceSummary>({ total: 0, present: 0, late: 0, absent: 0 });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const selected = reports.find((item) => item.key === selectedReport) || reports[0];
  const selectedMonth = monthOptions.find((item) => item.key === monthKey) || defaultMonth;

  const scopeLabel =
    dateMode === "monthly"
      ? `${selectedMonth?.label || "-"}`
      : `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;

  async function handleGeneratePreview() {
    if (selectedReport !== "attendance") {
      setPreviewRows([]);
      setPreviewSummary({ total: 0, present: 0, late: 0, absent: 0 });
      setPreviewError("Live preview is currently enabled only for Attendance reports.");
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token || "";
      const companyId = readStoredCompanyId();

      if (!accessToken) {
        throw new Error("Company session not found. Please login again.");
      }

      const response = await fetch("/api/company/reports/attendance/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(companyId ? { "x-company-id": companyId } : {}),
        },
        body: JSON.stringify({
          mode: dateMode,
          monthKey,
          startDate,
          endDate,
          employeeQuery,
          department,
          status,
          timeZone: INDIA_TIME_ZONE,
        }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        rows?: AttendancePreviewRow[];
        summary?: AttendanceSummary;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(json.error || "Unable to load attendance preview.");
      }

      setPreviewRows(Array.isArray(json.rows) ? json.rows : []);
      setPreviewSummary(
        json.summary || {
          total: Array.isArray(json.rows) ? json.rows.length : 0,
          present: 0,
          late: 0,
          absent: 0,
        }
      );
    } catch (error) {
      setPreviewRows([]);
      setPreviewSummary({ total: 0, present: 0, late: 0, absent: 0 });
      setPreviewError(error instanceof Error ? error.message : "Unable to load attendance preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Reports</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Build a corporate-ready reporting workspace for HR, payroll support, operations, and compliance. This phase
          defines the reporting shell, filters, and execution flow before live exports are connected.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Catalog</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Report Modules</h2>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {reports.length} modules
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {reports.map((report) => {
              const active = report.key === selectedReport;
              return (
                <button
                  key={report.key}
                  type="button"
                  onClick={() => setSelectedReport(report.key)}
                  className={[
                    "w-full rounded-2xl border p-4 text-left transition",
                    active
                      ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                      : "border-slate-200 bg-slate-50 text-slate-900 hover:bg-white",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={active ? "text-[11px] uppercase tracking-wide text-slate-300" : "text-[11px] uppercase tracking-wide text-slate-500"}>
                        {report.category}
                      </div>
                      <div className="mt-1 text-sm font-semibold">{report.title}</div>
                    </div>
                    <span
                      className={[
                        "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                        active ? "border-white/20 bg-white/10 text-white" : statusBadge(report.status),
                      ].join(" ")}
                    >
                      {statusLabel(report.status)}
                    </span>
                  </div>
                  <p className={active ? "mt-2 text-xs text-slate-300" : "mt-2 text-xs text-slate-600"}>{report.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <div className={active ? "text-lg font-bold text-white" : "text-lg font-bold text-slate-900"}>{report.primaryMetric}</div>
                      <div className={active ? "text-[11px] text-slate-300" : "text-[11px] text-slate-500"}>{report.primaryLabel}</div>
                    </div>
                    <div className={active ? "text-[11px] text-slate-300" : "text-[11px] text-slate-500"}>
                      {report.exports.join(" / ")}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{selected.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">{selected.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current Scope</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{scopeLabel}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Format Plan</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{selected.exports.join(" / ")}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Priority</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{selected.primaryLabel}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {selectedReport === "attendance" && previewSummary.total > 0 ? `${previewSummary.total} rows ready` : statusLabel(selected.status)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1.15fr)_320px]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selection Mode</span>
                    <select
                      value={dateMode}
                      onChange={(e) => setDateMode(e.target.value as DateMode)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="date_range">Date Range</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Month</span>
                    <select
                      value={monthKey}
                      onChange={(e) => setMonthKey(e.target.value)}
                      disabled={dateMode !== "monthly"}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none disabled:opacity-50"
                    >
                      {monthOptions.map((month) => (
                        <option key={month.key} value={month.key}>
                          {month.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Employee Search</span>
                    <input
                      value={employeeQuery}
                      onChange={(e) => setEmployeeQuery(e.target.value)}
                      placeholder="Employee name / code"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From Date</span>
                    <input
                      type="date"
                      value={startDate}
                      min={firstAvailableDate}
                      max={yesterdayISO}
                      disabled={dateMode !== "date_range"}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none disabled:opacity-50"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To Date</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate}
                      max={yesterdayISO}
                      disabled={dateMode !== "date_range"}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none disabled:opacity-50"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Department</span>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
                    >
                      <option value="all">All Departments</option>
                      <option value="operations">Operations</option>
                      <option value="hr">HR</option>
                      <option value="sales">Sales</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status Filter</span>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="present">Present</option>
                      <option value="late">Late</option>
                      <option value="absent">Absent</option>
                    </select>
                  </label>

                  <div className="flex items-end gap-3">
                    <button
                      type="button"
                      onClick={handleGeneratePreview}
                      className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
                    >
                      {previewLoading ? "Loading..." : "Generate Preview"}
                    </button>
                    <button
                      type="button"
                      disabled
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                    >
                      Export
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Preview Area</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Attendance preview now loads live data. Other report modules will connect in later tasks.
                      </p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {previewLoading ? "Loading..." : `${previewSummary.total} rows`}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Selected Report</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{selected.title}</div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filter Scope</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{scopeLabel}</div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Export Readiness</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {selectedReport === "attendance" ? "Preview ready, export next" : selected.exports.join(" / ")}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-white bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">{previewSummary.total}</div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Present</div>
                      <div className="mt-1 text-lg font-semibold text-emerald-700">{previewSummary.present}</div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Late</div>
                      <div className="mt-1 text-lg font-semibold text-amber-700">{previewSummary.late}</div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Absent</div>
                      <div className="mt-1 text-lg font-semibold text-rose-700">{previewSummary.absent}</div>
                    </div>
                  </div>

                  {previewError && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {previewError}
                    </div>
                  )}

                  {selectedReport === "attendance" ? (
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                      <table className="min-w-[900px] w-full text-left text-sm">
                        <thead className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Employee</th>
                            <th className="px-3 py-3 font-semibold">Department</th>
                            <th className="px-3 py-3 font-semibold">Shift</th>
                            <th className="px-3 py-3 font-semibold">Date</th>
                            <th className="px-3 py-3 font-semibold">Check In</th>
                            <th className="px-3 py-3 font-semibold">Check Out</th>
                            <th className="px-3 py-3 font-semibold">Work Hours</th>
                            <th className="px-3 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!previewLoading && previewRows.length === 0 && !previewError && (
                            <tr>
                              <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                                Generate preview to load attendance report rows.
                              </td>
                            </tr>
                          )}
                          {previewRows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100 text-slate-700">
                              <td className="px-3 py-3 font-semibold text-slate-900">{row.employee}</td>
                              <td className="px-3 py-3">{row.department}</td>
                              <td className="px-3 py-3">{row.shift}</td>
                              <td className="px-3 py-3">{row.date}</td>
                              <td className="px-3 py-3">{row.checkIn}</td>
                              <td className="px-3 py-3">{row.checkOut}</td>
                              <td className="px-3 py-3 font-semibold text-slate-900">{row.workHours}</td>
                              <td className="px-3 py-3">
                                <span
                                  className={[
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
                                    attendanceStatusChip(row.status),
                                  ].join(" ")}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                      Live preview is not connected yet for this report module.
                    </div>
                  )}
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">This Report Includes</p>
                  <div className="mt-3 space-y-2">
                    {selected.includes.map((item) => (
                      <div key={item} className="rounded-xl border border-white bg-white px-3 py-3 text-sm text-slate-700">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Delivery Plan</p>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-xs font-semibold text-slate-900">Task 1</div>
                      <div className="mt-1 text-sm text-slate-600">Reports shell, module selector, filters, and preview workspace.</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-xs font-semibold text-slate-900">Task 2</div>
                      <div className="mt-1 text-sm text-slate-600">Attendance report preview with backend data and validation.</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-xs font-semibold text-slate-900">Task 3</div>
                      <div className="mt-1 text-sm text-slate-600">Attendance CSV export and production-ready download flow.</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Build Note</p>
                  <h3 className="mt-2 text-base font-semibold">Start With Attendance</h3>
                  <p className="mt-2 text-sm text-slate-300">
                    Attendance has the strongest data foundation in the app. It should be the first live report before
                    leaves, claims, and correction audit exports.
                  </p>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
