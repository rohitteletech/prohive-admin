"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/client";
import { todayISOInIndia } from "@/lib/dateTime";

type CompanyStatus = "trial_active" | "paid_active" | "grace_paid" | "suspended";
type PlanType = "trial" | "monthly" | "yearly";

type CompanyRow = {
  id: string;
  name: string;
  code: string;
  plan_type: PlanType;
  plan_start: string;
  plan_end: string;
  status: CompanyStatus;
};

export default function Page() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | CompanyStatus>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [dataMessage, setDataMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadCompanies() {
      if (!hasSupabaseEnv()) {
        if (!ignore) {
          setCompanies([]);
          setDataMessage("Supabase env vars are missing. Configure env to load companies.");
          setIsLoading(false);
        }
        return;
      }

      const supabase = getSupabaseBrowserClient("super");
      if (!supabase) {
        if (!ignore) {
          setCompanies([]);
          setDataMessage("Supabase client unavailable.");
          setIsLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("id,name,code,plan_type,plan_start,plan_end,status")
        .order("created_at", { ascending: false });

      if (error) {
        if (!ignore) {
          setCompanies([]);
          setDataMessage(`Live load failed (${error.message}).`);
          setIsLoading(false);
        }
        return;
      }

      if (!ignore) {
        const rows = (data || []) as CompanyRow[];
        setCompanies(rows);
        setDataMessage(rows.length ? "Connected to Supabase live data." : "No live companies found.");
        setIsLoading(false);
      }
    }

    loadCompanies();
    return () => {
      ignore = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return companies;
    return companies.filter((c) => c.status === statusFilter);
  }, [companies, statusFilter]);

  const planLabel = (p: PlanType) => {
    if (p === "trial") return "Trial";
    if (p === "monthly") return "Monthly";
    return "Yearly";
  };

  const statusBadgeStyle = (s: CompanyStatus): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      padding: "3px 10px",
      borderRadius: 999,
      fontSize: 12,
      border: "1px solid #ddd",
      background: "#fafafa",
      lineHeight: "16px",
    };

    if (s === "suspended") return { ...base, borderColor: "#ffb3b3", background: "#fff1f1" };
    if (s === "grace_paid") return { ...base, borderColor: "#ffe29a", background: "#fff8e6" };
    if (s === "paid_active") return { ...base, borderColor: "#b7e4c7", background: "#ecfff3" };
    return { ...base, borderColor: "#cfe3ff", background: "#f2f7ff" };
  };

  const remainingText = (endDateStr: string) => {
    const end = new Date(`${endDateStr}T00:00:00Z`);
    const today = new Date(`${todayISOInIndia()}T00:00:00Z`);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((end.getTime() - today.getTime()) / msPerDay);

    if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? "" : "s"} remaining`;
    if (diffDays === 0) return "Ends today";
    const past = Math.abs(diffDays);
    return `Expired ${past} day${past === 1 ? "" : "s"} ago`;
  };

  return (
    <div style={pageWrap}>
      <div style={topBar}>
        <div>
          <h2 style={title}>Super Admin - Companies</h2>
          <div style={subTitle}>Plan, lifecycle status, and company service visibility.</div>
        </div>

        <Link href="/super/companies/new" style={newBtn}>
          + New Company
        </Link>
      </div>

      <div style={filterRow}>
        <div style={filterLabel}>Status Filter:</div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | CompanyStatus)} style={selectStyle}>
          <option value="all">All</option>
          <option value="trial_active">trial_active</option>
          <option value="paid_active">paid_active</option>
          <option value="grace_paid">grace_paid</option>
          <option value="suspended">suspended</option>
        </select>
        {isLoading && <span style={{ fontSize: 12, color: "#4b5563" }}>Loading...</span>}
      </div>

      {dataMessage && <div style={{ marginTop: 10, fontSize: 12, color: "#4b5563" }}>{dataMessage}</div>}

      <div style={tableWrap}>
        <div style={headerRow}>
          <div>Company</div>
          <div>Code</div>
          <div>Plan</div>
          <div>Start</div>
          <div>End</div>
          <div>Remaining</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {isLoading ? (
          <div style={loadingRow}>Loading companies from server...</div>
        ) : filtered.length === 0 ? (
          <div style={emptyRow}>No companies found for this filter.</div>
        ) : (
          filtered.map((c) => (
            <div key={c.id} style={dataRow}>
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#666" }}>ID: {c.id}</div>
              </div>

              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 13 }}>
                {c.code}
              </div>

              <div style={{ fontSize: 14 }}>{planLabel(c.plan_type)}</div>
              <div style={monoDate}>{c.plan_start}</div>
              <div style={monoDate}>{c.plan_end}</div>
              <div style={{ fontSize: 13, color: "#333" }}>{remainingText(c.plan_end)}</div>

              <div style={{ display: "grid", gap: 4 }}>
                <span style={statusBadgeStyle(c.status)}>{c.status}</span>
                {c.status === "grace_paid" && <span style={{ fontSize: 12, color: "#8a6d00" }}>Grace period active</span>}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href={`/super/companies/${c.id}`} style={actionLinkStyle}>
                  View
                </Link>
                <button type="button" disabled style={disabledActionBtnStyle}>
                  Renew Soon
                </button>
                <button type="button" disabled style={disabledActionBtnStyle}>
                  Status Workflow Pending
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={noteStyle}>Note: renew and status changes stay disabled until the backend workflow is connected.</div>
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  padding: 24,
  fontSize: 14,
  color: "#111",
};

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: 0.2,
};

const subTitle: React.CSSProperties = {
  marginTop: 6,
  color: "#555",
  fontSize: 13,
};

const newBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  textDecoration: "none",
  color: "#111",
  background: "#fff",
  height: 40,
  fontWeight: 600,
};

const filterRow: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const filterLabel: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
};

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  outline: "none",
  background: "#fff",
  fontSize: 14,
};

const tableWrap: React.CSSProperties = {
  marginTop: 16,
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  overflow: "hidden",
};

const headerRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2.2fr 1.1fr 0.9fr 1.1fr 1.1fr 1.2fr 1.2fr 2fr",
  padding: "10px 12px",
  background: "#fafafa",
  borderBottom: "1px solid #e5e5e5",
  fontWeight: 800,
  fontSize: 12.5,
  color: "#222",
};

const dataRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "2.2fr 1.1fr 0.9fr 1.1fr 1.1fr 1.2fr 1.2fr 2fr",
  padding: "12px 12px",
  borderBottom: "1px solid #eee",
  alignItems: "center",
};

const emptyRow: React.CSSProperties = {
  padding: 14,
  color: "#555",
  fontSize: 14,
};

const loadingRow: React.CSSProperties = {
  padding: 18,
  color: "#374151",
  fontSize: 14,
};

const monoDate: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
};

const noteStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#666",
  fontSize: 12,
};

const actionLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#111",
  border: "1px solid #ddd",
  padding: "7px 10px",
  borderRadius: 10,
  background: "#fff",
  display: "inline-flex",
  alignItems: "center",
  fontSize: 13.5,
  fontWeight: 600,
};

const actionBtnStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "7px 10px",
  borderRadius: 10,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13.5,
  fontWeight: 600,
};

const disabledActionBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  cursor: "not-allowed",
  opacity: 0.55,
  color: "#6b7280",
  background: "#f8fafc",
};
