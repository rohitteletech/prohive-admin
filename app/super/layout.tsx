"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/super-login") return;

    try {
      const raw = localStorage.getItem("phv_super_session");
      if (!raw) {
        router.replace("/super-login");
        return;
      }

      const session = JSON.parse(raw);
      if (!session || session.role !== "super_admin") {
        router.replace("/super-login");
      }
    } catch {
      router.replace("/super-login");
    }
  }, [router, pathname]);

  async function handleLogout() {
    try {
      const supabase = getSupabaseBrowserClient("super");
      await supabase?.auth.signOut();
      localStorage.removeItem("phv_super_session");
      document.cookie = "prohive_super=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    } finally {
      router.replace("/super-login");
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{ width: 240, padding: 16, borderRight: "1px solid #ddd", display: "flex", flexDirection: "column" }}>
        <b>Super Admin</b>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <Link href="/super/companies">Companies</Link>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            marginTop: "auto",
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
            textAlign: "left",
            fontWeight: 600,
          }}
        >
          Logout
        </button>
      </div>

      <div style={{ flex: 1, padding: "16px 16px 16px 20px" }}>{children}</div>
    </div>
  );
}
