"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CompanyHoliday, HolidayType } from "@/lib/companyLeaves";
import { formatDayName, formatDisplayDateShort } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  GOVERNMENT_HOLIDAY_STATE_OPTIONS,
  GovernmentHolidayItem,
  GovernmentHolidayState,
} from "@/lib/governmentHolidays";

export default function ManageHolidaysPage() {
  const [rows, setRows] = useState<CompanyHoliday[]>([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<HolidayType>("company");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [govtYear, setGovtYear] = useState<number>(new Date().getFullYear());
  const [govtState, setGovtState] = useState<GovernmentHolidayState>("all_india");
  const [govtSourceUrl, setGovtSourceUrl] = useState("");
  const [govtSourceName, setGovtSourceName] = useState("");
  const [govtLoading, setGovtLoading] = useState(false);
  const [govtSuggestions, setGovtSuggestions] = useState<GovernmentHolidayItem[]>([]);
  const [selectedGovtKeys, setSelectedGovtKeys] = useState<string[]>([]);

  useEffect(() => {
    let ignore = false;

    async function loadHolidays() {
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

      const response = await fetch("/api/company/settings/holidays", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json().catch(() => ({}))) as {
        holidays?: CompanyHoliday[];
        error?: string;
      };
      if (ignore) return;
      setLoading(false);
      if (!response.ok) {
        setToast(result.error || "Unable to load holidays.");
        return;
      }
      setRows(Array.isArray(result.holidays) ? result.holidays : []);
    }

    void loadHolidays();
    return () => {
      ignore = true;
    };
  }, []);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [rows]
  );
  const existingKeys = useMemo(
    () => new Set(rows.map((r) => `${r.date}|${r.name.trim().toLowerCase()}`)),
    [rows]
  );
  const selectableGovtKeys = useMemo(
    () =>
      govtSuggestions
        .filter((row) => !existingKeys.has(`${row.date}|${row.name.trim().toLowerCase()}`))
        .map((row) => row.key),
    [existingKeys, govtSuggestions]
  );
  const formattedManualDate = date ? formatDisplayDateShort(date) : "";
  const manualDayName = date ? formatDayName(date) : "";

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  }

  useEffect(() => {
    let ignore = false;

    async function loadGovernmentSuggestions() {
      const supabase = getSupabaseBrowserClient("company");
      const sessionResult = supabase ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      if (!accessToken) return;

      setGovtLoading(true);
      const response = await fetch(`/api/company/settings/holidays/government?year=${govtYear}&state=${govtState}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const result = (await response.json().catch(() => ({}))) as {
        rows?: GovernmentHolidayItem[];
        source?: { name?: string; url?: string };
        error?: string;
      };
      if (ignore) return;
      setGovtLoading(false);
      if (!response.ok) {
        setGovtSuggestions([]);
        setGovtSourceUrl("");
        setGovtSourceName("");
        showToast(result.error || "Unable to load government holidays.");
        return;
      }
      setGovtSuggestions(Array.isArray(result.rows) ? result.rows : []);
      setGovtSourceUrl(String(result.source?.url || ""));
      setGovtSourceName(String(result.source?.name || ""));
      setSelectedGovtKeys([]);
    }

    void loadGovernmentSuggestions();
    return () => {
      ignore = true;
    };
  }, [govtYear, govtState]);

  function resetForm() {
    setDate("");
    setName("");
    setType("company");
  }

  function toggleGovtSelection(key: string, checked: boolean) {
    setSelectedGovtKeys((prev) => {
      if (checked) {
        if (prev.includes(key)) return prev;
        return [...prev, key];
      }
      return prev.filter((item) => item !== key);
    });
  }

  function setAllGovtSelection(checked: boolean) {
    if (!checked) {
      setSelectedGovtKeys([]);
      return;
    }
    setSelectedGovtKeys(selectableGovtKeys);
  }

  function handleAddSelectedGovtHolidays() {
    const selectedSet = new Set(selectedGovtKeys);
    const chosen = govtSuggestions.filter((row) => selectedSet.has(row.key));
    if (chosen.length === 0) return showToast("Select government holidays first.");

    const nextRows: CompanyHoliday[] = [];
    let skipped = 0;
    chosen.forEach((item) => {
      const dedupeKey = `${item.date}|${item.name.trim().toLowerCase()}`;
      if (existingKeys.has(dedupeKey)) {
        skipped += 1;
        return;
      }
      nextRows.push({
        id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: item.date,
        name: item.name,
        type: item.type,
      });
    });

    if (nextRows.length === 0) {
      return showToast("Selected holidays already exist in calendar.");
    }

    setRows((prev) => [...prev, ...nextRows]);
    setSelectedGovtKeys([]);
    showToast(`Added ${nextRows.length} holiday(s).${skipped ? ` Skipped ${skipped} duplicate(s).` : ""}`);
  }

  function handleAddHoliday() {
    const normalizedName = name.trim();
    if (!date) return showToast("Holiday date is required.");
    if (!normalizedName) return showToast("Holiday name is required.");

    const duplicate = rows.some((r) => r.date === date && r.name.toLowerCase() === normalizedName.toLowerCase());
    if (duplicate) return showToast("This holiday already exists.");

    const next: CompanyHoliday = {
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `h-${Date.now()}`,
      date,
      name: normalizedName,
      type,
    };

    setRows((prev) => [...prev, next]);
    resetForm();
  }

  function handleDeleteHoliday(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSaveHolidays() {
    const supabase = getSupabaseBrowserClient("company");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Company session not found. Please login again.");

    setSaving(true);
    const response = await fetch("/api/company/settings/holidays", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        holidays: rows,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      holidays?: CompanyHoliday[];
      error?: string;
    };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return showToast(result.error || "Unable to save holidays.");
    }
    setRows(Array.isArray(result.holidays) ? result.holidays : []);
    showToast("Holiday calendar saved.");
  }

  function typeBadge(typeValue: HolidayType) {
    if (typeValue === "national") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (typeValue === "festival") return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return (
    <div className="mx-auto max-w-7xl px-2 pb-5 pt-0 sm:px-3 lg:px-4 lg:pb-6 lg:pt-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Holiday Calendar</h1>
        <p className="mt-2 text-sm text-zinc-600">Manage the company-wide holiday list used across the app.</p>
      </div>

      {toast && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">{toast}</div>
      )}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Add Holiday</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/company/settings/policies/holiday-weekly-off-policy"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open Holiday / Weekly Off Policy
            </Link>
            <button
              type="button"
              onClick={handleSaveHolidays}
              disabled={saving || loading}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Holidays"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Government Holiday Suggestions</h3>
            <span className="text-xs text-slate-500">
              {govtSourceUrl ? (
                <a href={govtSourceUrl} target="_blank" rel="noreferrer" className="underline hover:no-underline">
                  {govtSourceName || "Source"}
                </a>
              ) : govtSourceName ? (
                govtSourceName
              ) : (
                "Pick and add to company calendar"
              )}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            `Add Selected` only prepares rows in the holiday calendar below. Click `Save Holidays` to persist changes.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="grid gap-1.5">
              <span className="text-sm text-slate-700">Year</span>
              <input
                type="number"
                min={2000}
                max={2100}
                value={govtYear}
                onChange={(e) => setGovtYear(Number(e.target.value || new Date().getFullYear()))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-slate-700">State</span>
              <select
                value={govtState}
                onChange={(e) => setGovtState(e.target.value as GovernmentHolidayState)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
              >
                {GOVERNMENT_HOLIDAY_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-2 flex items-end gap-2">
              <button
                type="button"
                onClick={() => setAllGovtSelection(true)}
                disabled={govtLoading || selectableGovtKeys.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setAllGovtSelection(false)}
                disabled={selectedGovtKeys.length === 0}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleAddSelectedGovtHolidays}
                disabled={selectedGovtKeys.length === 0}
                className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add Selected
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Day</th>
                  <th className="px-3 py-2 font-semibold">Holiday Name</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Keep</th>
                </tr>
              </thead>
              <tbody>
                {govtLoading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                      Loading official holidays...
                    </td>
                  </tr>
                )}
                {govtSuggestions.map((row) => {
                  const dedupeKey = `${row.date}|${row.name.trim().toLowerCase()}`;
                  const alreadyAdded = existingKeys.has(dedupeKey);
                  return (
                    <tr key={row.key} className="border-b border-slate-200 text-sm text-slate-700 last:border-b-0">
                      <td className="px-3 py-2">{formatDisplayDateShort(row.date)}</td>
                      <td className="px-3 py-2 capitalize">{formatDayName(row.date)}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        {alreadyAdded && <div className="text-xs text-slate-500">Already added</div>}
                      </td>
                      <td className="px-3 py-2 capitalize">{row.type}</td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedGovtKeys.includes(row.key)}
                          disabled={alreadyAdded}
                          onChange={(e) => toggleGovtSelection(row.key, e.target.checked)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {govtSuggestions.length === 0 && !govtLoading && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                      No suggestions available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            />
            <span className="text-xs text-slate-500">
              {formattedManualDate ? `Display: ${formattedManualDate}` : "Display: dd-MMM-yyyy"}
            </span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">Day</span>
            <input
              value={manualDayName}
              readOnly
              placeholder="Auto from date"
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
            />
          </label>

          <label className="grid gap-1.5 md:col-span-1">
            <span className="text-sm text-slate-700">Holiday Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Annual Foundation Day"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm text-slate-700">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as HolidayType)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="national">National</option>
              <option value="festival">Festival</option>
              <option value="company">Company</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleAddHoliday}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Add Holiday
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Holiday Calendar</h2>
          <span className="text-xs text-slate-500">{sortedRows.length} holidays</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Day</th>
                  <th className="px-4 py-3 font-semibold">Holiday Name</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 text-sm text-slate-700 last:border-b-0">
                  <td className="px-4 py-3">{formatDisplayDateShort(row.date)}</td>
                  <td className="px-4 py-3 capitalize">{formatDayName(row.date)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                  <td className="px-4 py-3">
                    <span className={["rounded-full border px-2.5 py-1 text-xs font-semibold capitalize", typeBadge(row.type)].join(" ")}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteHoliday(row.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {!sortedRows.length && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No holidays added yet.
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
