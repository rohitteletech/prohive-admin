"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { todayISOInIndia } from "@/lib/dateTime";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/client";

type CompanyStatus = "trial_active" | "paid_active" | "grace_paid" | "suspended";
type PlanType = "trial" | "monthly" | "yearly";

type CompanyDetail = {
  id: string;
  name: string;
  code: string | null;
  size_of_employees: string | null;
  authorized_name: string | null;
  mobile: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pin_code: string | null;
  plan_type: PlanType | null;
  plan_start: string | null;
  plan_end: string | null;
  status: CompanyStatus | null;
  admin_email: string | null;
  gst: string | null;
  business_nature: string | null;
  company_tagline: string | null;
  created_at: string | null;
};

function planLabel(value: PlanType | null) {
  if (value === "trial") return "Trial";
  if (value === "monthly") return "Monthly";
  if (value === "yearly") return "Yearly";
  return "-";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatTimestamp(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function displayValue(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || "-";
}

function statusBadgeStyle(status: CompanyStatus | null): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid #ddd",
    background: "#fafafa",
    lineHeight: "16px",
    fontWeight: 700,
  };

  if (status === "suspended") return { ...base, borderColor: "#fecaca", background: "#fff1f2", color: "#9f1239" };
  if (status === "grace_paid") return { ...base, borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" };
  if (status === "paid_active") return { ...base, borderColor: "#bbf7d0", background: "#ecfdf5", color: "#166534" };
  if (status === "trial_active") return { ...base, borderColor: "#bfdbfe", background: "#eff6ff", color: "#1d4ed8" };
  return base;
}

function InfoCard(props: { title: string; rows: Array<{ label: string; value: string }> }) {
  return (
    <section style={cardStyle}>
      <h2 style={sectionTitle}>{props.title}</h2>
      <div style={infoGrid}>
        {props.rows.map((row) => (
          <div key={`${props.title}-${row.label}`} style={infoRow}>
            <div style={infoLabel}>{row.label}</div>
            <div style={infoValue}>{row.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Page() {
  const routeParams = useParams<{ companyId?: string | string[] }>();
  const companyIdParam = routeParams?.companyId;
  const companyId = Array.isArray(companyIdParam) ? companyIdParam[0] || "" : companyIdParam || "";
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadCompany() {
      setLoading(true);
      setError(null);

      if (!companyId) {
        if (!ignore) {
          setCompany(null);
          setLoading(false);
          setError("Company id is missing.");
        }
        return;
      }

      if (!hasSupabaseEnv()) {
        if (!ignore) {
          setCompany(null);
          setLoading(false);
          setError("Supabase env vars are missing.");
        }
        return;
      }

      const supabase = getSupabaseBrowserClient("super");
      if (!supabase) {
        if (!ignore) {
          setCompany(null);
          setLoading(false);
          setError("Supabase client unavailable.");
        }
        return;
      }

      const sessionResult = await supabase.auth.getSession();
      const accessToken = sessionResult.data.session?.access_token || "";
      if (!accessToken) {
        if (!ignore) {
          setCompany(null);
          setLoading(false);
          setError("Super admin session not found. Please login again.");
        }
        return;
      }

      try {
        const response = await fetch(`/api/super/companies/${companyId}`, {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });
        const json = (await response.json().catch(() => ({}))) as {
          company?: CompanyDetail;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(json.error || "Unable to load company details.");
        }

        if (!ignore) {
          setCompany(json.company || null);
        }
      } catch (loadError) {
        if (!ignore) {
          setCompany(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to load company details.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadCompany();
    return () => {
      ignore = true;
    };
  }, [companyId]);

  const remainingText = useMemo(() => {
    const endDate = company?.plan_end || "";
    if (!endDate) return "-";

    const end = new Date(`${endDate}T00:00:00Z`);
    const today = new Date(`${todayISOInIndia()}T00:00:00Z`);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((end.getTime() - today.getTime()) / msPerDay);

    if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? "" : "s"} remaining`;
    if (diffDays === 0) return "Ends today";
    const past = Math.abs(diffDays);
    return `Expired ${past} day${past === 1 ? "" : "s"} ago`;
  }, [company?.plan_end]);

  return (
    <div style={pageWrap}>
      <div style={topBar}>
        <div>
          <div style={breadcrumbRow}>
            <Link href="/super/companies" style={breadcrumbLink}>
              Companies
            </Link>
            <span style={breadcrumbSep}>/</span>
            <span style={breadcrumbCurrent}>View</span>
          </div>
          <h1 style={pageTitle}>Super Admin - Company Detail</h1>
          <p style={subTitle}>Registration details, subscription info, and admin ownership for this company.</p>
        </div>

        <Link href={`/super/companies/${companyId}/employees`} style={employeesLink}>
          View Employees
        </Link>
      </div>

      {loading ? (
        <div style={messageCard}>Loading company details...</div>
      ) : error ? (
        <div style={errorCard}>{error}</div>
      ) : !company ? (
        <div style={messageCard}>Company details not found.</div>
      ) : (
        <>
          <section style={heroCard}>
            <div>
              <div style={eyebrow}>Company</div>
              <h2 style={heroTitle}>{displayValue(company.name)}</h2>
              <div style={heroMeta}>
                <span>ID: {company.id}</span>
                <span>Code: {displayValue(company.code)}</span>
                <span>Created: {formatTimestamp(company.created_at)}</span>
              </div>
              {company.company_tagline ? <p style={taglineText}>{company.company_tagline}</p> : null}
            </div>
            <div style={heroStatusWrap}>
              <span style={statusBadgeStyle(company.status)}>{displayValue(company.status)}</span>
              <div style={heroHint}>{remainingText}</div>
            </div>
          </section>

          <div style={sectionGrid}>
            <InfoCard
              title="Company Basics"
              rows={[
                { label: "Company Name", value: displayValue(company.name) },
                { label: "Company Code", value: displayValue(company.code) },
                { label: "Size of Employees", value: displayValue(company.size_of_employees) },
                { label: "Business Nature", value: displayValue(company.business_nature) },
                { label: "GST", value: displayValue(company.gst) },
              ]}
            />

            <InfoCard
              title="Authorized Person"
              rows={[
                { label: "Authorized Name", value: displayValue(company.authorized_name) },
                { label: "Mobile", value: displayValue(company.mobile) },
                { label: "Admin Email", value: displayValue(company.admin_email) },
              ]}
            />

            <InfoCard
              title="Address"
              rows={[
                { label: "Address", value: displayValue(company.address) },
                { label: "City", value: displayValue(company.city) },
                { label: "State", value: displayValue(company.state) },
                { label: "Country", value: displayValue(company.country) },
                { label: "PIN Code", value: displayValue(company.pin_code) },
              ]}
            />

            <InfoCard
              title="Subscription"
              rows={[
                { label: "Plan", value: planLabel(company.plan_type) },
                { label: "Plan Start", value: formatDate(company.plan_start) },
                { label: "Plan End", value: formatDate(company.plan_end) },
                { label: "Remaining", value: remainingText },
                { label: "Status", value: displayValue(company.status) },
              ]}
            />
          </div>
        </>
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

const employeesLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#0f172a",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 700,
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

const heroCard: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 20,
  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
};

const eyebrow: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontWeight: 700,
};

const heroTitle: React.CSSProperties = {
  margin: "6px 0 0 0",
  fontSize: 28,
  fontWeight: 800,
  color: "#0f172a",
};

const heroMeta: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  fontSize: 13,
  color: "#475569",
};

const taglineText: React.CSSProperties = {
  marginTop: 12,
  fontSize: 14,
  color: "#334155",
};

const heroStatusWrap: React.CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 10,
};

const heroHint: React.CSSProperties = {
  fontSize: 13,
  color: "#475569",
  fontWeight: 600,
};

const sectionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  background: "#fff",
  padding: 18,
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const infoGrid: React.CSSProperties = {
  marginTop: 14,
  display: "grid",
  gap: 12,
};

const infoRow: React.CSSProperties = {
  display: "grid",
  gap: 4,
};

const infoLabel: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const infoValue: React.CSSProperties = {
  fontSize: 14,
  color: "#0f172a",
  wordBreak: "break-word",
};
