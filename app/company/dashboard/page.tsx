"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCompanyEmployeesSupabase } from "@/lib/companyEmployees";
import { todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Tone = "info" | "positive" | "negative" | "warning" | "neutral";

type Kpi = {
  title: string;
  value: string;
  tone: Tone;
};

type QueueItem = {
  title: string;
  pending: number;
  note: string;
  tone: Tone;
};

type DashboardData = {
  employeeCount: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  pendingCorrections: number;
  pendingLeaves: number;
  pendingClaims: number;
};

const EMPTY_DASHBOARD: DashboardData = {
  employeeCount: 0,
  presentToday: 0,
  lateToday: 0,
  absentToday: 0,
  pendingCorrections: 0,
  pendingLeaves: 0,
  pendingClaims: 0,
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
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadDashboardData() {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) {
        if (!ignore) setLoading(false);
        return;
      }

      const todayIso = todayISOInIndia();
      const [employees, attendanceRes, correctionsRes, leavesRes, claimsRes] = await Promise.all([
        loadCompanyEmployeesSupabase(),
        fetch(`/api/company/attendance?date=${todayIso}`, {
          headers: { authorization: `Bearer ${accessToken}` },
        }),
        fetch("/api/company/corrections", {
          headers: { authorization: `Bearer ${accessToken}` },
        }),
        fetch("/api/company/leaves", {
          headers: { authorization: `Bearer ${accessToken}` },
        }),
        fetch("/api/company/claims", {
          headers: { authorization: `Bearer ${accessToken}` },
        }),
      ]);

      const attendanceJson = (await attendanceRes.json().catch(() => ({}))) as {
        rows?: Array<{
          status?: "present" | "late" | "half_day" | "absent" | "off_day_worked" | "manual_review";
          presentTodayEligible?: boolean;
        }>;
      };
      const correctionsJson = (await correctionsRes.json().catch(() => ({}))) as {
        rows?: Array<{ status?: "pending" | "approved" | "rejected" }>;
      };
      const leavesJson = (await leavesRes.json().catch(() => ({}))) as {
        rows?: Array<{ status?: "pending" | "approved" | "rejected" }>;
      };
      const claimsJson = (await claimsRes.json().catch(() => ({}))) as {
        rows?: Array<{ status?: "pending" | "approved" | "rejected" }>;
      };

      const attendanceRows = Array.isArray(attendanceJson.rows) ? attendanceJson.rows : [];
      const correctionsRows = Array.isArray(correctionsJson.rows) ? correctionsJson.rows : [];
      const leavesRows = Array.isArray(leavesJson.rows) ? leavesJson.rows : [];
      const claimsRows = Array.isArray(claimsJson.rows) ? claimsJson.rows : [];

      if (ignore) return;

      setData({
        employeeCount: employees.length,
        presentToday: attendanceRows.filter((row) => row.presentTodayEligible === true).length,
        lateToday: attendanceRows.filter((row) => row.status === "late").length,
        absentToday: attendanceRows.filter((row) => row.status === "absent").length,
        pendingCorrections: correctionsRows.filter((row) => row.status === "pending").length,
        pendingLeaves: leavesRows.filter((row) => row.status === "pending").length,
        pendingClaims: claimsRows.filter((row) => row.status === "pending").length,
      });
      setLoading(false);
    }

    loadDashboardData();
    return () => {
      ignore = true;
    };
  }, []);

  const kpis: Kpi[] = useMemo(
    () => [
      { title: "Employees", value: String(data.employeeCount), tone: "info" },
      { title: "Present Today", value: String(data.presentToday), tone: "positive" },
      { title: "Today Absent", value: String(data.absentToday), tone: "negative" },
      {
        title: "Pending Approvals",
        value: String(data.pendingCorrections + data.pendingLeaves + data.pendingClaims),
        tone: "warning",
      },
    ],
    [data]
  );

  const queue: QueueItem[] = useMemo(
    () => [
      {
        title: "Attendance Corrections",
        pending: data.pendingCorrections,
        note: "Requests waiting for action in the drawer menu",
        tone: "warning",
      },
      {
        title: "Leave Approvals",
        pending: data.pendingLeaves,
        note: "Leave queue can be opened from the drawer",
        tone: "info",
      },
      {
        title: "Claims Approvals",
        pending: data.pendingClaims,
        note: "Claim review remains available from the drawer",
        tone: "positive",
      },
    ],
    [data]
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
        <div className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{companyName} Dashboard</h1>
              <p className="mt-2 text-sm text-zinc-600">One view for workforce health, approvals, and daily operations.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge text="Current Month" tone="neutral" />
              <Badge text={loading ? "Loading..." : "Live Data"} tone="info" />
              <Badge text="System Healthy" tone="positive" />
            </div>
          </div>
        </div>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item) => {
            const t = toneStyles(item.tone);
            return (
              <article key={item.title} className={["rounded-xl border bg-white p-3 shadow-sm", t.card.replace(/bg-\S+/, "bg-white")].join(" ")}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-wide text-slate-600">{item.title}</p>
                  <span className={["h-2 w-2 rounded-full", t.dot].join(" ")} />
                </div>
                <p className="mt-1.5 text-[24px] font-semibold leading-none tracking-tight text-slate-900">{item.value}</p>
              </article>
            );
          })}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">Pending Work Snapshot</h2>
            <p className="mt-1 text-[13px] text-slate-600">Operational counts remain visible here while page navigation moves into the drawer.</p>

            <div className="mt-4 space-y-3">
              {queue.map((item) => {
                const tone = toneStyles(item.tone);
                return (
                  <article key={item.title} className="min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-[12px] text-slate-500">{item.note}</p>
                      </div>
                      <Badge text={`${item.pending} pending`} tone={item.tone} />
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className={["h-full rounded-full", tone.bar].join(" ")} style={{ width: `${Math.min(item.pending * 18, 100)}%` }} />
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-[15px] font-semibold text-slate-900">Navigation Model</h2>
            <p className="mt-1 text-[13px] text-slate-600">Primary workflow pages are now grouped inside the left drawer to keep the dashboard cleaner.</p>

            <div className="mt-4 space-y-3">
              <div className="min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[13px] font-semibold text-slate-900">Drawer Order</p>
                <p className="mt-1 text-[12px] text-slate-500">Profile, Leave, Calendar, Claim, Correction, then Logout fixed at the bottom.</p>
              </div>
              <div className="min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[13px] font-semibold text-slate-900">Header Pattern</p>
                <p className="mt-1 text-[12px] text-slate-500">Four-line menu icon, company name, and tagline now anchor the top navigation.</p>
              </div>
              <div className="min-h-[76px] rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[13px] font-semibold text-slate-900">Logic Safety</p>
                <p className="mt-1 text-[12px] text-slate-500">Existing page components and API flows stay unchanged. Only navigation entry points were moved.</p>
              </div>
            </div>
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-slate-500">Copyright {new Date().getFullYear()} CatchRouteSolutions Pvt. Ltd.</p>
      </div>
    </div>
  );
}
