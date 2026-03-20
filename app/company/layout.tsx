"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const mainMenuItems = [
  { href: "/company/dashboard", label: "Dashboard", description: "Operational overview" },
  { href: "/company/employees", label: "Employees", description: "Manage employee records" },
  { href: "/company/attendance", label: "Attendance", description: "View daily attendance" },
  { href: "/company/reports", label: "Reports", description: "Export workforce reports" },
  { href: "/company/leaves", label: "Leave", description: "Review and approve leave requests" },
  { href: "/company/corrections", label: "Correction", description: "Resolve attendance correction requests" },
  { href: "/company/manual-reviews", label: "Manual Reviews", description: "Review holiday and weekly-off manual cases" },
  { href: "/company/comp-off-ledger", label: "Comp Off Ledger", description: "Track earned and used comp off balances" },
  { href: "/company/claims", label: "Claim", description: "Review employee claim submissions" },
  { href: "/company/hr-policy", label: "HR Policy", description: "Policy and handbook" },
  { href: "/company/settings/holidays", label: "Holiday Calendar", description: "Manage company-wide holiday dates" },
  { href: "/company/settings", label: "Settings", description: "Admin account, company profile, and security settings" },
];

const policyItems = [
  { href: "/company/settings/policies", label: "Policy Hub", description: "Open the new standalone company policy pages" },
  { href: "/company/settings/policies/assignments", label: "Policy Assignments", description: "Assign policies by company, department, or employee" },
  { href: "/company/settings/policies/shift-policy", label: "Shift Policy", description: "Define shifts, schedules, and timing rules" },
  { href: "/company/settings/policies/attendance-policy", label: "Attendance Policy", description: "Define present-day and attendance rules" },
  { href: "/company/settings/policies/leave-policy", label: "Leave Policy", description: "Configure leave rules and balances" },
  { href: "/company/settings/policies/holiday-weekly-off-policy", label: "Holiday / Weekly Off Policy", description: "Manage holidays and weekly off patterns" },
  { href: "/company/settings/policies/correction-regularization-policy", label: "Correction / Regularization Policy", description: "Define missing-punch and correction rules" },
];

type NavItem = {
  href: string;
  label: string;
  description: string;
};

type CompanyInfo = {
  name: string;
  tagline: string;
  displayName: string;
  adminId: string;
  designation: string;
};

function navItemStyle(active: boolean) {
  return {
    display: "flex",
    alignItems: "flex-start",
    minHeight: 52,
    padding: "11px 12px",
    borderRadius: 14,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? "#1e3a8a" : "#334155",
    background: active ? "#dbeafe" : "transparent",
    transition: "background 160ms ease, color 160ms ease, transform 160ms ease",
  } satisfies React.CSSProperties;
}

function SidebarGroup({
  items,
  pathname,
  compact = false,
}: {
  items: NavItem[];
  pathname: string;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: compact ? 2 : 4 }}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} style={navItemStyle(active)}>
            <span style={{ display: "grid", gap: 3 }}>
              <span>{item.label}</span>
              <span style={{ fontSize: 11, lineHeight: 1.3, color: active ? "#1d4ed8" : "#64748b", fontWeight: 500 }}>
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function HamburgerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open navigation menu"
      style={{
        display: "grid",
        placeItems: "center",
        width: 42,
        height: 42,
        borderRadius: 12,
        border: "1px solid #cbd5e1",
        background: "#ffffff",
        cursor: "pointer",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
      }}
    >
      <span style={{ display: "grid", gap: 4 }}>
        {[0, 1, 2, 3].map((line) => (
          <span
            key={line}
            style={{
              display: "block",
              width: line % 2 === 0 ? 18 : 14,
              height: 2,
              borderRadius: 999,
              background: "#1e3a8a",
              justifySelf: "start",
            }}
          />
        ))}
      </span>
    </button>
  );
}

export default function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "Company",
    tagline: "Focused workforce operations",
    displayName: "Company Admin",
    adminId: "",
    designation: "Company Admin",
  });

  useEffect(() => {
    try {
      const rawCompany = localStorage.getItem("phv_company");
      const rawSession = localStorage.getItem("phv_company_session");
      const company = rawCompany ? JSON.parse(rawCompany) : {};
      const session = rawSession ? JSON.parse(rawSession) : {};
      const fallbackName =
        typeof company.authorized_name === "string" && company.authorized_name.trim()
          ? company.authorized_name.trim()
          : typeof company.name === "string" && company.name.trim()
            ? `${company.name.trim()} Admin`
            : "Company Admin";
      setCompanyInfo({
        name: typeof company.name === "string" && company.name.trim() ? company.name.trim() : "Company",
        tagline:
          typeof company.company_tagline === "string" && company.company_tagline.trim()
            ? company.company_tagline.trim()
            : "Focused workforce operations",
        displayName: fallbackName,
        adminId:
          typeof company.code === "string" && company.code.trim()
            ? company.code.trim()
            : typeof session.email === "string"
              ? session.email.trim()
              : "",
        designation: "Company Admin",
      });
    } catch {
    }
  }, [pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [drawerOpen]);

  useEffect(() => {
    let active = true;

    async function validateCompanySession() {
      if (pathname === "/login") return;

      try {
        const raw = localStorage.getItem("phv_company_session");
        if (!raw) {
          router.replace("/login");
          return;
        }

        const session = JSON.parse(raw);
        if (!session || session.role !== "company_admin") {
          router.replace("/login");
          return;
        }

        const supabase = getSupabaseBrowserClient("company");
        const { data } = (await supabase?.auth.getUser()) || { data: { user: null } };
        const authEmail = data.user?.email?.trim().toLowerCase() || "";
        const sessionEmail = String(session.email || "").trim().toLowerCase();

        if (!authEmail || (sessionEmail && authEmail !== sessionEmail)) {
          localStorage.removeItem("phv_company_session");
          localStorage.removeItem("phv_company");
          localStorage.removeItem("phv-sb-company-auth");
          document.cookie = "prohive_company=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
          document.cookie = "prohive_company_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
          if (active) router.replace("/login");
          return;
        }

        if (session.must_change_password && pathname !== "/company/settings") {
          router.replace("/company/settings?forcePassword=1");
        }
      } catch {
        router.replace("/login");
      }
    }

    validateCompanySession();

    return () => {
      active = false;
    };
  }, [router, pathname]);

  async function handleLogout() {
    try {
      const supabase = getSupabaseBrowserClient("company");
      await supabase?.auth.signOut();
      localStorage.removeItem("phv_company_session");
      localStorage.removeItem("phv_company");
      localStorage.removeItem("phv-sb-company-auth");
      document.cookie = "prohive_company=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
      document.cookie = "prohive_company_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "14px 20px",
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          position: "sticky",
          top: 0,
          zIndex: 40,
          boxShadow: "0 8px 30px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <HamburgerButton onClick={() => setDrawerOpen(true)} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {companyInfo.name}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {companyInfo.tagline}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a8a", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "8px 12px" }}>
          {companyInfo.designation}
        </div>
      </header>

      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation drawer"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.44)",
            border: "none",
            padding: 0,
            margin: 0,
            zIndex: 50,
            cursor: "pointer",
          }}
        />
      )}

      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 60,
          width: 320,
          maxWidth: "88vw",
          height: "100vh",
          background: "#ffffff",
          borderRight: "1px solid #e5e7eb",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "24px 22px 20px",
            background: "linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 100%)",
            color: "#ffffff",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.7)",
              display: "grid",
              placeItems: "center",
              fontSize: 28,
              fontWeight: 800,
              background: "rgba(255,255,255,0.14)",
              margin: "0 auto 16px",
            }}
          >
            {companyInfo.displayName.trim().slice(0, 1).toUpperCase() || "A"}
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                lineHeight: 1.2,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                wordBreak: "break-word",
              }}
            >
              {companyInfo.displayName}
            </div>
            <div style={{ fontSize: 12, opacity: 0.88, marginTop: 6 }}>
              {companyInfo.adminId ? `Admin ID: ${companyInfo.adminId}` : "Admin access enabled"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.96, marginTop: 4 }}>{companyInfo.designation}</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "grid", gap: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>
              Main Menu
            </div>
            <SidebarGroup items={mainMenuItems} pathname={pathname} />
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>
              Policy Studio
            </div>
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 18,
                padding: 10,
                background: "#f8fafc",
              }}
            >
              <SidebarGroup items={policyItems} pathname={pathname} compact />
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", padding: 16, borderTop: "1px solid #e5e7eb", background: "#ffffff", flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 46,
              padding: "0 12px",
              borderRadius: 14,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#be123c",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      <main style={{ padding: 20, minWidth: 0 }}>{children}</main>
    </div>
  );
}
