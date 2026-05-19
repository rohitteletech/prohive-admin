"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/client";

type EmployeeRow = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  mobile: string | null;
  status: string | null;
  mobile_app_status: string | null;
  bound_device_name: string | null;
  bound_app_version: string | null;
  bound_device_id: string | null;
  bound_device_at: string | null;
  mobile_last_login_at: string | null;
  last_punch_at: string | null;
};

type CompanyEmployeeResponse = {
  company?: {
    id: string;
    name: string | null;
    code: string | null;
  } | null;
  rows?: EmployeeRow[];
  error?: string;
};

function displayValue(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || "-";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function statusChipStyle(kind: string | null): React.CSSProperties {
  const normalized = String(kind || "").trim().toLowerCase();
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    background: "#f8fafc",
    color: "#334155",
  };

  if (normalized === "active") return { ...base, borderColor: "#bbf7d0", background: "#ecfdf5", color: "#166534" };
  if (normalized === "blocked" || normalized === "inactive") {
    return { ...base, borderColor: "#fecaca", background: "#fff1f2", color: "#9f1239" };
  }
  if (normalized === "invited") return { ...base, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" };
  return base;
}

export default function Page() {
  const routeParams = useParams<{ companyId?: string | string[] }>();
  const companyIdParam = routeParams?.companyId;
  const companyId = Array.isArray(companyIdParam) ? companyIdParam[0] || "" : companyIdParam || "";

  const [companyName, setCompanyName] = useState<string>("");
  const [companyCode, setCompanyCode] = useState<string>("");
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadEmployees() {
      setLoading(true);
      setError(null);

      if (!companyId) {
        if (!ignore) {
          setRows([]);
          setLoading(false);
          setError("Company id is missing.");
        }
        return;
      }

      if (!hasSupabaseEnv()) {
        if (!ignore) {
          setRows([]);
          setLoading(false);
          setError("Supabase env vars are missing.");
        }
        return;
      }

      const supabase = getSupabaseBrowserClient("super");
      if (!supabase) {
        if (!ignore) {
          setRows([]);
          setLoading(false);
          setError("Supabase client unavailable.");
        }
        return;
      }

      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data.session?.access_token || "";
      if (!accessToken) {
        if (!ignore) {
          setRows([]);
          setLoading(false);
          setError("Super admin session not found. Please login again.");
        }
        return;
      }

      try {
        const response = await fetch(`/api/super/companies/${companyId}/employees`, {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });
        const json = (await response.json().catch(() => ({}))) as CompanyEmployeeResponse;

        if (!response.ok) {
          throw new Error(json.error || "Unable to load company employees.");
        }

        if (!ignore) {
          setRows(Array.isArray(json.rows) ? json.rows : []);
          setCompanyName(String(json.company?.name || ""));
          setCompanyCode(String(json.company?.code || ""));
        }
      } catch (loadError) {
        if (!ignore) {
          setRows([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load company employees.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadEmployees();
    return () => {
      ignore = true;
    };
  }, [companyId]);

  return (
    <div style={pageWrap}>
      <div style={topBar}>
        <div>
          <div style={breadcrumbRow}>
            <Link href="/super/companies" style={breadcrumbLink}>
              Companies
            </Link>
            <span style={breadcrumbSep}>/</span>
            <Link href={`/super/companies/${companyId}`} style={breadcrumbLink}>
              Company Detail
            </Link>
            <span style={breadcrumbSep}>/</span>
            <span style={breadcrumbCurrent}>Employees</span>
          </div>
          <h1 style={pageTitle}>Super Admin - Company Employees</h1>
          <p style={subTitle}>
            {companyName ? `${companyName}${companyCode ? ` (${companyCode})` : ""}` : "Company employee list"}
          </p>
        </div>

        <Link href={`/super/companies/${companyId}`} style={backBtnStyle}>
          Back To Company
        </Link>
      </div>

      {loading ? (
        <div style={messageCard}>Loading employees...</div>
      ) : error ? (
        <div style={errorCard}>{error}</div>
      ) : (
        <div style={tableWrap}>
          <div style={tableHeaderRow}>
            {[
              "Employee",
              "Code",
              "Mobile",
              "Employee Status",
              "Mobile App",
              "Device Name",
              "App Version",
              "Device ID",
              "Bound At",
              "Last Punch",
            ].map((label) => (
              <div key={label} style={tableHeaderCell}>
                {label}
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div style={messageCard}>No employees found for this company.</div>
          ) : (
            rows.map((row) => (
              <div key={row.id} style={tableDataRow}>
                <div style={tableCell}>
                  <div style={{ fontWeight: 700 }}>{displayValue(row.full_name)}</div>
                </div>
                <div style={tableCell}>{displayValue(row.employee_code)}</div>
                <div style={tableCell}>{displayValue(row.mobile)}</div>
                <div style={tableCell}>
                  <span style={statusChipStyle(row.status)}>{displayValue(row.status)}</span>
                </div>
                <div style={tableCell}>
                  <span style={statusChipStyle(row.mobile_app_status)}>{displayValue(row.mobile_app_status)}</span>
                </div>
                <div style={tableCell}>{displayValue(row.bound_device_name)}</div>
                <div style={tableCell}>{displayValue(row.bound_app_version)}</div>
                <div style={tableCell}>{displayValue(row.bound_device_id)}</div>
                <div style={tableCell}>{formatDateTime(row.bound_device_at)}</div>
                <div style={tableCell}>{formatDateTime(row.last_punch_at || row.mobile_last_login_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 18,
};

const topBar: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
};

const breadcrumbRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 12,
  color: "#64748b",
  marginBottom: 8,
  flexWrap: "wrap",
};

const breadcrumbLink: React.CSSProperties = {
  color: "#334155",
  textDecoration: "none",
  fontWeight: 600,
};

const breadcrumbSep: React.CSSProperties = {
  color: "#94a3b8",
};

const breadcrumbCurrent: React.CSSProperties = {
  color: "#64748b",
};

const pageTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  color: "#0f172a",
};

const subTitle: React.CSSProperties = {
  marginTop: 8,
  color: "#475569",
  fontSize: 14,
};

const backBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#ffffff",
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 700,
  border: "1px solid #cbd5e1",
};

const messageCard: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: 20,
  color: "#475569",
};

const errorCard: React.CSSProperties = {
  ...messageCard,
  borderColor: "#fecaca",
  background: "#fff1f2",
  color: "#9f1239",
};

const tableWrap: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  overflow: "hidden",
  background: "#fff",
};

const tableHeaderRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 0.9fr 1fr 1fr 1fr 1fr 0.9fr 1fr 1fr 1fr",
  gap: 0,
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const tableHeaderCell: React.CSSProperties = {
  padding: 14,
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const tableDataRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 0.9fr 1fr 1fr 1fr 1fr 0.9fr 1fr 1fr 1fr",
  gap: 0,
  borderBottom: "1px solid #f1f5f9",
};

const tableCell: React.CSSProperties = {
  padding: 14,
  fontSize: 14,
  color: "#0f172a",
  wordBreak: "break-word",
};
