"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CompanyEmployee,
  EmpStatus,
  loadCompanyEmployees,
  loadCompanyEmployeesSupabase,
} from "@/lib/companyEmployees";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

export default function CompanyEmployeesPage() {
  const [rows, setRows] = useState<CompanyEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | EmpStatus>("all");

  useEffect(() => {
    let ignore = false;
    async function hydrateFromServer() {
      if (!ignore) {
        setRows(loadCompanyEmployees());
      }
      const next = await loadCompanyEmployeesSupabase();
      if (!ignore) {
        setRows(next);
        setLoading(false);
      }
    }
    hydrateFromServer();

    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "phv_company_employees_v1") return;
      setRows(loadCompanyEmployees());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      ignore = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const inactive = rows.filter((r) => r.status === "inactive").length;
    return { total, active, inactive };
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      const statusOk = status === "all" ? true : r.status === status;
      const text = [r.full_name, r.email || "", r.employee_code, r.mobile, r.designation, r.department || ""].join(" ").toLowerCase();
      const searchOk = query ? text.includes(query) : true;
      return statusOk && searchOk;
    });
  }, [rows, q, status]);

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Employees</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Manage employees, view profile status, and update HR details.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Total: <b>{stats.total}</b></span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">Active: <b>{stats.active}</b></span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-zinc-700">Inactive: <b>{stats.inactive}</b></span>
          </div>
        </div>

        <Link
          href="/company/employees/new"
          className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
        >
          Add Employee
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-1 text-xs font-medium text-zinc-700">Search</div>
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
            <span className="text-zinc-400">Search</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name / phone / email / code / designation"
              className="w-full bg-transparent text-sm text-zinc-900 outline-none"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-zinc-700">Status</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "all" | EmpStatus)}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="text-sm font-semibold text-zinc-900">Employee List</div>
          <div className="text-xs text-zinc-500">
            {loading ? "Loading from Supabase..." : "Data synced from Supabase"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-t border-zinc-200">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs font-semibold text-zinc-600">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Designation</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 text-sm text-zinc-900">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-extrabold text-zinc-700">
                        {r.full_name
                          .split(" ")
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase())
                          .join("")}
                      </div>

                      <div>
                        <div className="font-semibold">{r.full_name}</div>
                        <div className="text-xs text-zinc-500">{r.email || "-"}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">{r.employee_code}</td>
                  <td className="px-6 py-4">{r.designation}</td>
                  <td className="px-6 py-4">{r.mobile}</td>

                  <td className="px-6 py-4">
                    {r.status === "active" ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                        Inactive
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-zinc-700">{formatDate(r.joined_on)}</td>

                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/company/employees/${r.id}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                    >
                      Manage <span className="text-zinc-400">{"->"}</span>
                    </Link>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr className="border-t border-zinc-200">
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-zinc-500">
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
