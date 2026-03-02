"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { loadCompanyEmployees } from "@/lib/companyEmployees";

type Tone = "info" | "positive" | "negative" | "warning" | "neutral";

type Kpi = {
  title: string;
  value: string;
  tone: Tone;
};

type QueueItem = {
  title: string;
  pending: number;
  target: number;
  href: string;
  tone: Tone;
};

function toneStyles(tone: Tone) {
  switch (tone) {
    case "positive":
      return {
        dot: "bg-emerald-500",
        card: "border-emerald-200 bg-emerald-50",
        chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
        text: "text-emerald-700",
        bar: "bg-emerald-500",
      };
    case "negative":
      return {
        dot: "bg-rose-500",
        card: "border-rose-200 bg-rose-50",
        chip: "bg-rose-50 text-rose-700 border-rose-200",
        text: "text-rose-700",
        bar: "bg-rose-500",
      };
    case "warning":
      return {
        dot: "bg-amber-500",
        card: "border-amber-200 bg-amber-50",
        chip: "bg-amber-50 text-amber-700 border-amber-200",
        text: "text-amber-700",
        bar: "bg-amber-500",
      };
    case "info":
      return {
        dot: "bg-sky-500",
        card: "border-sky-200 bg-sky-50",
        chip: "bg-sky-50 text-sky-700 border-sky-200",
        text: "text-sky-700",
        bar: "bg-sky-500",
      };
    default:
      return {
        dot: "bg-slate-400",
        card: "border-slate-200 bg-slate-50",
        chip: "bg-slate-100 text-slate-700 border-slate-200",
        text: "text-slate-700",
        bar: "bg-slate-400",
      };
  }
}

function Badge({ text, tone }: { text: string; tone: Tone }) {
  const t = toneStyles(tone);
  return (
    <span className={["inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold", t.chip].join(" ")}>
      {text}
    </span>
  );
}

export default function CompanyDashboardPage() {
  const [companyName] = useState(() => {
    try {
      const raw = localStorage.getItem("phv_company");
      const company = raw ? JSON.parse(raw) : null;
      return company?.name || "Company";
    } catch {
      return "Company";
    }
  });
  const [employeeCount] = useState(() => loadCompanyEmployees().length);

  const kpis: Kpi[] = useMemo(
    () => [
      { title: "Employees", value: String(employeeCount), tone: "info" },
      { title: "Present Today", value: "0", tone: "positive" },
      { title: "Pending Approvals", value: "0", tone: "warning" },
      { title: "Alerts", value: "0", tone: "neutral" },
    ],
    [employeeCount]
  );

  const queue: QueueItem[] = [
    { title: "Attendance Corrections", pending: 0, target: 0, href: "/company/corrections", tone: "warning" },
    { title: "Leave Approvals", pending: 0, target: 0, href: "/company/leaves", tone: "info" },
    { title: "Claims Approvals", pending: 0, target: 0, href: "/company/claims", tone: "positive" },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">COMPANY ADMIN</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{companyName} Dashboard</h1>
                <p className="mt-2 text-[13px] text-slate-600">One view for workforce health, approvals, and daily operations.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge text="Current Month" tone="neutral" />
                <Badge text="Updated 10 min ago" tone="info" />
                <Badge text="System Healthy" tone="positive" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
            <Link href="/company/employees" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100">
              Manage Employees {"->"}
            </Link>
            <Link href="/company/attendance" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100">
              Open Attendance {"->"}
            </Link>
            <Link href="/company/reports" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-100">
              View Reports {"->"}
            </Link>
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item) => {
            const t = toneStyles(item.tone);
            return (
              <article key={item.title} className={["rounded-xl border bg-white p-3 shadow-sm", t.card.replace(/bg-\S+/, "bg-white")].join(" ")}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-wide text-slate-600">{item.title}</p>
                  <span className={["h-2 w-2 rounded-full", t.dot].join(" ")} />
                </div>
                <p className="mt-1.5 text-[24px] font-semibold tracking-tight leading-none text-slate-900">{item.value}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">Approval Queue</h2>
            <p className="mt-1 text-[13px] text-slate-600">Prioritized pending requests for today.</p>

            <div className="mt-4 space-y-3">
              {queue.map((item) => {
                return (
                  <Link key={item.title} href={item.href} className="block min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-[12px] text-slate-500">Pending approvals requiring review</p>
                      </div>
                      <Badge text={`${item.pending} pending`} tone={item.tone} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">Reports and Exports</h2>
            <p className="mt-1 text-[13px] text-slate-600">Quick access to monthly operational reports.</p>

            <div className="mt-4 space-y-3">
              <Link href="/company/reports?tab=attendance" className="block min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100">
                <p className="text-[13px] font-semibold text-slate-900">Attendance Report</p>
                <p className="mt-1 text-[12px] text-slate-500">Download daily and monthly attendance summaries</p>
              </Link>
              <Link href="/company/reports?tab=leaves" className="block min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100">
                <p className="text-[13px] font-semibold text-slate-900">Leave Report</p>
                <p className="mt-1 text-[12px] text-slate-500">Track applied, approved, and rejected leaves</p>
              </Link>
              <Link href="/company/reports?tab=claims" className="block min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100">
                <p className="text-[13px] font-semibold text-slate-900">Claims Report</p>
                <p className="mt-1 text-[12px] text-slate-500">Review reimbursements and claim approvals</p>
              </Link>
            </div>
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-slate-500">Copyright {new Date().getFullYear()} CatchRouteSolutions Pvt. Ltd.</p>
      </div>
    </div>
  );
}
