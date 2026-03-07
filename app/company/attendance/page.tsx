"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate, INDIA_TIME_ZONE, todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AttendanceStatus = "present" | "late" | "absent";

type AttendanceRow = {
  id: string;
  employee: string;
  department: string;
  shift: string;
  date: string;
  checkIn: string;
  checkInAddress: string;
  checkInLatLng: string;
  checkOut: string;
  checkOutAddress: string;
  checkOutLatLng: string;
  workHours: string;
  status: AttendanceStatus;
};

function statusChip(status: AttendanceStatus) {
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
  const today = todayISOInIndia();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AttendanceStatus>("all");
  const [shift, setShift] = useState("all");
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadAttendance() {
      setLoading(true);
      setError(null);

      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token || "";
      const companyId = readStoredCompanyId();
      if (!accessToken) {
        if (!ignore) {
          setRows([]);
          setLoading(false);
          setError("Company session not found. Please login again.");
        }
        return;
      }

      const timeZone = INDIA_TIME_ZONE;

      try {
        const response = await fetch(`/api/company/attendance?date=${encodeURIComponent(date)}&timeZone=${encodeURIComponent(timeZone)}`, {
          headers: {
            authorization: `Bearer ${accessToken}`,
            ...(companyId ? { "x-company-id": companyId } : {}),
          },
        });
        const json = (await response.json().catch(() => ({}))) as { rows?: AttendanceRow[]; error?: string };
        if (!response.ok) {
          throw new Error(json.error || "Unable to load attendance.");
        }
        if (!ignore) {
          setRows(Array.isArray(json.rows) ? json.rows : []);
        }
      } catch (err) {
        if (!ignore) {
          setRows([]);
          setError(err instanceof Error ? err.message : "Unable to load attendance.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadAttendance();
    return () => {
      ignore = true;
    };
  }, [date]);

  const shiftOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((row) => row.shift).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const statusOk = status === "all" ? true : r.status === status;
      const shiftOk = shift === "all" ? true : r.shift === shift;
      const text = `${r.employee} ${r.department} ${r.checkInAddress} ${r.checkOutAddress}`.toLowerCase();
      const searchOk = q ? text.includes(q) : true;
      return statusOk && shiftOk && searchOk;
    });
  }, [rows, query, status, shift]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const present = filtered.filter((r) => r.status === "present").length;
    const late = filtered.filter((r) => r.status === "late").length;
    const absent = filtered.filter((r) => r.status === "absent").length;
    return { total, present, late, absent };
  }, [filtered]);

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Attendance</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Monitor daily attendance, identify delays quickly, and export records for compliance.
        </p>
      </div>

      <section className="mt-4 grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Total Records</p>
          <p className="mt-1 text-[24px] font-semibold tracking-tight text-slate-900">{stats.total}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Present</p>
          <p className="mt-1 text-[24px] font-semibold tracking-tight text-emerald-700">{stats.present}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Late</p>
          <p className="mt-1 text-[24px] font-semibold tracking-tight text-amber-700">{stats.late}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-slate-600">Absent</p>
          <p className="mt-1 text-[24px] font-semibold tracking-tight text-rose-700">{stats.absent}</p>
        </article>
      </section>

      <section className="mt-5 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee / department / address"
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 outline-none"
          />
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => {
              const next = e.target.value;
              setDate(next > today ? today : next);
            }}
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 outline-none"
          />
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 outline-none"
          >
            <option value="all">All Shifts</option>
            {shiftOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | AttendanceStatus)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-900 outline-none"
          >
            <option value="all">All Status</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
          </select>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Selected date: {formatDisplayDate(date)} (IST)</p>
      </section>

      <section className="mt-4 w-full max-w-full rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Attendance Data Grid</h2>
          <span className="text-xs text-slate-500">{loading ? "Loading..." : `${filtered.length} rows`}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1380px] w-full border-collapse text-left">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-200 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Employee</th>
                <th className="px-3 py-2 font-semibold">Department</th>
                <th className="px-3 py-2 font-semibold">Shift</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Check In</th>
                <th className="px-3 py-2 font-semibold">Check In Address</th>
                <th className="px-3 py-2 font-semibold">Check In Lat/Lng</th>
                <th className="px-3 py-2 font-semibold">Check Out</th>
                <th className="px-3 py-2 font-semibold">Check Out Address</th>
                <th className="px-3 py-2 font-semibold">Check Out Lat/Lng</th>
                <th className="px-3 py-2 font-semibold">Work Hours</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {!loading && error && (
                <tr>
                  <td colSpan={13} className="px-5 py-10 text-center text-[13px] text-rose-600">
                    {error}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={13} className="px-5 py-10 text-center text-[13px] text-slate-500">
                    Loading attendance records...
                  </td>
                </tr>
              )}
              {filtered.map((row, index) => (
                <tr key={row.id} className="border-b border-slate-100 text-xs text-slate-700 hover:bg-slate-50 last:border-b-0">
                  <td className="px-3 py-2 font-semibold text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{row.employee}</td>
                  <td className="px-3 py-2">{row.department}</td>
                  <td className="px-3 py-2">{row.shift}</td>
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2">{row.checkIn}</td>
                  <td className="px-3 py-2">{row.checkInAddress}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{row.checkInLatLng}</td>
                  <td className="px-3 py-2">{row.checkOut}</td>
                  <td className="px-3 py-2">{row.checkOutAddress}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{row.checkOutLatLng}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{row.workHours}</td>
                  <td className="px-3 py-2">
                    <span className={["rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize", statusChip(row.status)].join(" ")}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-5 py-10 text-center text-[13px] text-slate-500">
                    No approved attendance records match current filters.
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
