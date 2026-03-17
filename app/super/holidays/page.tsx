"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GOVERNMENT_HOLIDAY_STATE_OPTIONS,
  GovernmentHolidayState,
} from "@/lib/governmentHolidays";
import { GovernmentTemplateHolidayRow } from "@/lib/governmentHolidayTemplates";
import { formatDayName, formatDisplayDateShort } from "@/lib/dateTime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ApiRow = GovernmentTemplateHolidayRow;

export default function SuperHolidayTemplatesPage() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [state, setState] = useState<GovernmentHolidayState>("all_india");
  const [rows, setRows] = useState<ApiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [sourceMode, setSourceMode] = useState<"default" | "database">("default");
  const [metaLine, setMetaLine] = useState("");
  const [draft, setDraft] = useState<ApiRow>({
    date: "",
    name: "",
    type: "festival",
    scope: "national",
  });
  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2000);
  }

  async function loadRows(targetYear: number, targetState: GovernmentHolidayState) {
    const supabase = getSupabaseBrowserClient("super");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) {
      setRows([]);
      setPublished(false);
      setMetaLine("");
      showToast("Super admin session missing. Please login again.");
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/super/holiday-templates?year=${targetYear}&state=${targetState}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const result = (await response.json().catch(() => ({}))) as {
      rows?: ApiRow[];
      published?: boolean;
      sourceMode?: "default" | "database";
      updatedBy?: string;
      lastUpdatedAt?: string;
      lastPublishedAt?: string;
      error?: string;
    };
    setLoading(false);
    if (!response.ok) {
      setRows([]);
      setPublished(false);
      setMetaLine("");
      showToast(result.error || "Unable to load holiday templates.");
      return;
    }
    setRows(Array.isArray(result.rows) ? result.rows : []);
    setPublished(Boolean(result.published));
    setSourceMode(result.sourceMode === "database" ? "database" : "default");
    if (result.sourceMode === "database") {
      const bits = [
        result.lastUpdatedAt ? `Updated: ${result.lastUpdatedAt}` : "",
        result.updatedBy ? `By: ${result.updatedBy}` : "",
        result.lastPublishedAt ? `Published: ${result.lastPublishedAt}` : "Not published",
      ].filter(Boolean);
      setMetaLine(bits.join(" | "));
    } else {
      setMetaLine("Loaded from default starter template. Save draft to persist.");
    }
  }

  useEffect(() => {
    void loadRows(year, state);
  }, [year, state]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name))),
    [rows]
  );

  function addDraftRow() {
    const date = draft.date.trim();
    const name = draft.name.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showToast("Valid date is required.");
    if (!name) return showToast("Holiday name is required.");
    const exists = rows.some((row) => row.date === date && row.name.toLowerCase() === name.toLowerCase());
    if (exists) return showToast("Duplicate holiday row.");
    setRows((prev) => [
      ...prev,
      {
        ...draft,
        date,
        name,
        scope: state === "all_india" ? "national" : "state",
      },
    ]);
    setDraft((prev) => ({ ...prev, date: "", name: "" }));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveTemplate(publish: boolean) {
    if (rows.length === 0) return showToast("Add at least one holiday row.");

    const supabase = getSupabaseBrowserClient("super");
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data.session?.access_token;
    if (!accessToken) return showToast("Super admin session missing. Please login again.");

    setSaving(true);
    const response = await fetch("/api/super/holiday-templates", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ year, state, rows, publish }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!response.ok || !result.ok) {
      return showToast(result.error || "Unable to save holiday template.");
    }

    showToast(publish ? "Template published." : "Template saved as draft.");
    await loadRows(year, state);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h2 style={{ margin: 0, fontSize: 22 }}>Holiday Template Master</h2>
      <p style={{ margin: "8px 0 0", color: "#4b5563", fontSize: 13 }}>
        Super admin controls the official template. Company HR can only keep/skip from published template.
      </p>

      {toast && (
        <div style={{ marginTop: 12, border: "1px solid #bae6fd", background: "#f0f9ff", color: "#0c4a6e", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
          {toast}
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gap: 10, gridTemplateColumns: "180px 300px 1fr", alignItems: "end" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#334155" }}>Year</span>
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value || new Date().getFullYear()))}
            style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 12px", fontSize: 14 }}
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#334155" }}>State</span>
          <select
            value={state}
            onChange={(e) => setState(e.target.value as GovernmentHolidayState)}
            style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 12px", fontSize: 14 }}
          >
            {GOVERNMENT_HOLIDAY_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div style={{ fontSize: 12, color: "#475569", paddingBottom: 10 }}>
          {loading ? "Loading..." : `${published ? "Published" : "Draft only"} | Source: ${sourceMode} ${metaLine ? `| ${metaLine}` : ""}`}
        </div>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 140px 1.4fr 120px 90px", gap: 8, background: "#f8fafc", padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#475569" }}>
          <div>Date</div>
          <div>Day</div>
          <div>Holiday Name</div>
          <div>Type</div>
          <div>Action</div>
        </div>
        {sortedRows.map((row, index) => (
          <div key={`${row.date}-${row.name}-${index}`} style={{ display: "grid", gridTemplateColumns: "160px 140px 1.4fr 120px 90px", gap: 8, padding: "9px 12px", borderTop: "1px solid #e2e8f0", alignItems: "center", fontSize: 14 }}>
            <div>{formatDisplayDateShort(row.date)}</div>
            <div style={{ textTransform: "capitalize" }}>{formatDayName(row.date)}</div>
            <div style={{ fontWeight: 600 }}>{row.name}</div>
            <div style={{ textTransform: "capitalize" }}>{row.type}</div>
            <div>
              <button type="button" onClick={() => removeRow(index)} style={{ border: "1px solid #fecaca", color: "#b91c1c", background: "#fff1f2", borderRadius: 8, fontSize: 12, padding: "5px 8px" }}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {sortedRows.length === 0 && (
          <div style={{ borderTop: "1px solid #e2e8f0", padding: 14, color: "#64748b", fontSize: 14 }}>
            No rows in template.
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Add Row</div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "160px 1.6fr 120px 110px" }}>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
            style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 10px" }}
          />
          <input
            value={draft.name}
            placeholder="Holiday name"
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 10px" }}
          />
          <select
            value={draft.type}
            onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value === "national" ? "national" : "festival" }))}
            style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 10px" }}
          >
            <option value="national">National</option>
            <option value="festival">Festival</option>
          </select>
          <button type="button" onClick={addDraftRow} style={{ border: "1px solid #0f172a", background: "#0f172a", color: "white", borderRadius: 10, padding: "9px 10px", fontWeight: 700 }}>
            Add
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => saveTemplate(false)}
          disabled={saving || loading}
          style={{ border: "1px solid #94a3b8", background: "white", color: "#0f172a", borderRadius: 10, padding: "10px 12px", fontWeight: 700 }}
        >
          {saving ? "Saving..." : "Save Draft"}
        </button>
        <button
          type="button"
          onClick={() => saveTemplate(true)}
          disabled={saving || loading}
          style={{ border: "1px solid #166534", background: "#166534", color: "white", borderRadius: 10, padding: "10px 12px", fontWeight: 700 }}
        >
          {saving ? "Publishing..." : "Publish Template"}
        </button>
      </div>
    </div>
  );
}
