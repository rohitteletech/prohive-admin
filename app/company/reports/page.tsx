"use client";

import { useMemo, useState } from "react";
import { formatDisplayDate, todayISOInIndia } from "@/lib/dateTime";

type ReportType = "attendance" | "leave" | "claims" | "employee" | "compliance";
type ExportFormat = "pdf" | "xlsx" | "csv";

type ReportRow = {
  id: string;
  name: string;
  type: ReportType;
  format: ExportFormat;
};

type MonthOption = {
  key: string; // YYYY-MM
  label: string; // Nov-25
  startISO: string; // YYYY-MM-DD
  endISO: string; // YYYY-MM-DD
};

type ReportCriteria = {
  mode: "monthly" | "date_range";
  monthKey: string;
  startDate: string;
  endDate: string;
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

const REPORT_AVAILABLE_FROM = "2025-11-01";

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

  const [criteriaByReport, setCriteriaByReport] = useState<Record<string, ReportCriteria>>({
    r1: { mode: "monthly", monthKey: defaultMonth.key, startDate: REPORT_AVAILABLE_FROM, endDate: yesterdayISO },
    r3: { mode: "monthly", monthKey: defaultMonth.key, startDate: REPORT_AVAILABLE_FROM, endDate: yesterdayISO },
    r4: { mode: "monthly", monthKey: defaultMonth.key, startDate: REPORT_AVAILABLE_FROM, endDate: yesterdayISO },
    r5: { mode: "monthly", monthKey: defaultMonth.key, startDate: REPORT_AVAILABLE_FROM, endDate: yesterdayISO },
  });
  const [toast, setToast] = useState<string | null>(null);

  const reports = useMemo<ReportRow[]>(
    () => [
      { id: "r1", name: "Monthly Attendance Summary", type: "attendance", format: "xlsx" },
      { id: "r3", name: "Leave Consumption vs Balance", type: "leave", format: "xlsx" },
      { id: "r4", name: "Claims TAT and Approval Audit", type: "claims", format: "pdf" },
      { id: "r5", name: "Attendance Correction Report", type: "attendance", format: "xlsx" },
    ],
    []
  );

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }

  function monthMeta(monthKey: string) {
    return monthOptions.find((m) => m.key === monthKey) || defaultMonth;
  }

  function setCriteria(id: string, next: ReportCriteria) {
    setCriteriaByReport((prev) => ({ ...prev, [id]: next }));
  }

  function handleMonthChange(id: string, monthKey: string) {
    const current = criteriaByReport[id];
    setCriteria(id, {
      mode: current?.mode || "monthly",
      monthKey,
      startDate: current?.startDate || REPORT_AVAILABLE_FROM,
      endDate: current?.endDate || yesterdayISO,
    });
  }

  function handleStartDateChange(id: string, value: string) {
    if (!value) return;
    const current = criteriaByReport[id];
    const clamped = value < REPORT_AVAILABLE_FROM ? REPORT_AVAILABLE_FROM : value > yesterdayISO ? yesterdayISO : value;
    const endDate = current?.endDate || yesterdayISO;
    setCriteria(id, {
      mode: current?.mode || "date_range",
      monthKey: current?.monthKey || defaultMonth.key,
      startDate: clamped,
      endDate: endDate < clamped ? clamped : endDate,
    });
  }

  function handleEndDateChange(id: string, value: string) {
    if (!value) return;
    const current = criteriaByReport[id];
    const startDate = current?.startDate || REPORT_AVAILABLE_FROM;
    let clamped = value < REPORT_AVAILABLE_FROM ? REPORT_AVAILABLE_FROM : value > yesterdayISO ? yesterdayISO : value;
    if (clamped < startDate) clamped = startDate;
    setCriteria(id, {
      mode: current?.mode || "date_range",
      monthKey: current?.monthKey || defaultMonth.key,
      startDate,
      endDate: clamped,
    });
  }

  function handleDownload(row: ReportRow) {
    const criteria = criteriaByReport[row.id];
    if (criteria?.mode === "date_range") {
      showToast(`Download started: ${row.name}.${row.format} (${formatDisplayDate(criteria.startDate)} to ${formatDisplayDate(criteria.endDate)})`);
      return;
    }
    const label = monthMeta(criteria?.monthKey || defaultMonth.key).label;
    showToast(`Download started: ${row.name}.${row.format} (${label})`);
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 px-6 py-5 text-white">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-sky-100">COMPANY ADMIN</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reports Command Center</h1>
          <p className="mt-2 text-sm text-sky-100">
            Generate, monitor, and export workforce reports for operations, payroll, and compliance.
          </p>
        </div>
      </section>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {toast}
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Report Catalog</h2>
          <span className="text-xs text-slate-500">{reports.length} reports</span>
        </div>

        <div>
          <table className="w-full table-fixed text-left">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3 font-semibold">Report Name</th>
                <th className="px-3 py-3 font-semibold">Category</th>
                <th className="px-3 py-3 font-semibold">Selection</th>
                <th className="px-3 py-3 font-semibold">Month</th>
                <th className="px-3 py-3 font-semibold">Start Date</th>
                <th className="px-3 py-3 font-semibold">End Date</th>
                <th className="px-3 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((row) => {
                const criteria = criteriaByReport[row.id] || {
                  mode: "monthly" as const,
                  monthKey: defaultMonth.key,
                  startDate: REPORT_AVAILABLE_FROM,
                  endDate: yesterdayISO,
                };
                const monthLabel = monthMeta(criteria.monthKey).label;
                return (
                  <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                    <td className="px-3 py-3 font-semibold text-slate-900">{row.name}</td>
                    <td className="px-3 py-3 capitalize">{row.type}</td>
                    <td className="px-3 py-3">
                      <select
                        value={criteria.mode}
                        onChange={(e) =>
                          setCriteria(row.id, {
                            ...criteria,
                            mode: e.target.value as "monthly" | "date_range",
                          })
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="date_range">Date Range</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {criteria.mode === "monthly" ? (
                        <select
                          value={criteria.monthKey}
                          onChange={(e) => handleMonthChange(row.id, e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none"
                        >
                          {monthOptions.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex min-h-[40px] items-center text-sm text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {criteria.mode === "date_range" ? (
                        <input
                          type="date"
                          value={criteria.startDate}
                          min={REPORT_AVAILABLE_FROM}
                          max={yesterdayISO}
                          onChange={(e) => handleStartDateChange(row.id, e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none"
                        />
                      ) : (
                        <span className="inline-flex min-h-[40px] items-center text-sm text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {criteria.mode === "date_range" ? (
                        <input
                          type="date"
                          value={criteria.endDate}
                          min={criteria.startDate}
                          max={yesterdayISO}
                          onChange={(e) => handleEndDateChange(row.id, e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none"
                        />
                      ) : (
                        <span className="inline-flex min-h-[40px] items-center text-sm text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="mb-1 text-[11px] text-slate-500">
                        {criteria.mode === "date_range"
                          ? `${formatDisplayDate(criteria.startDate)} to ${formatDisplayDate(criteria.endDate)}`
                          : monthLabel}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownload(row)}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700"
                      >
                        Download
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
