"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const primaryItems = [
  { href: "/company/dashboard", label: "Dashboard" },
  { href: "/company/employees", label: "Employees" },
  { href: "/company/attendance", label: "Attendance" },
  { href: "/company/corrections", label: "Attendance Corrections" },
  { href: "/company/claims", label: "Claims" },
  { href: "/company/leaves", label: "Leaves" },
  { href: "/company/reports", label: "Reports" },
  { href: "/company/settings/shifts", label: "Shift Control" },
  { href: "/company/settings/leaves", label: "Leave Settings" },
  { href: "/company/settings/holidays", label: "Manage Holidays" },
];

const secondaryItems = [{ href: "/company/settings", label: "Settings" }];

function navItemStyle(active: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    minHeight: 40,
    padding: "0 12px",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? "#111827" : "#475569",
    background: active ? "#e5e7eb" : "transparent",
    transition: "background 160ms ease, color 160ms ease",
  } satisfies React.CSSProperties;
}

function SidebarGroup({
  items,
  pathname,
}: {
  items: { href: string; label: string }[];
  pathname: string;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={navItemStyle(active)}>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

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
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <aside
        style={{
          width: 260,
          minWidth: 260,
          maxWidth: 260,
          flexShrink: 0,
          background: "#f8fafc",
          borderRight: "1px solid #e5e7eb",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div style={{ padding: "8px 8px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>Admin</div>
        </div>

        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
          <SidebarGroup items={primaryItems} pathname={pathname} />
        </div>

        <div style={{ marginTop: "auto", borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 4 }}>
          <SidebarGroup items={secondaryItems} pathname={pathname} />
          <button
            type="button"
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              minHeight: 40,
              padding: "0 12px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              color: "#475569",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 24, minWidth: 0 }}>{children}</main>
    </div>
  );
}
