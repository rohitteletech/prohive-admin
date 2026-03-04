"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/client";

type LoginMode = "company" | "super";

export default function LoginCard({ mode }: { mode: LoginMode }) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const title = mode === "super" ? "Super Admin Login" : "Company Admin Login";

  const subtitle =
    mode === "super"
      ? "Restricted access. Super administrators only."
      : "Securely sign in to manage workforce, attendance and policies.";

  const features = useMemo(
    () => [
      "GPS verified punches",
      "Plan enforcement logic",
      "Audit ready reporting",
      "Multi-tenant access control",
    ],
    []
  );

  const superAdminAllowList = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
    return raw
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }, []);

  function setCookie(name: string, value: string) {
    document.cookie = `${name}=${value}; path=/; SameSite=Lax`;
  }

  function hardNavigate(path: string) {
    window.location.assign(path);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    setMsg(null);
    setBusy(true);

    try {
      const e1 = email.trim().toLowerCase();
      const p1 = password.trim();

      if (!e1 || !p1) {
        setMsg("Email and Password are required.");
        return;
      }

      let target: string | null = null;
      let role: "super_admin" | "company_admin" | null = null;

      // SUPER LOGIN
      if (mode === "super") {
        if (!hasSupabaseEnv()) {
          setMsg("Supabase is not configured. Please set env keys.");
          return;
        }

        const supabase = getSupabaseBrowserClient("super");
        if (!supabase) {
          setMsg("Supabase client is unavailable.");
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: e1,
          password: p1,
        });

        if (error || !data.user) {
          setMsg(error?.message || "Invalid Super Admin credentials.");
          return;
        }

        if (superAdminAllowList.length > 0 && !superAdminAllowList.includes(e1)) {
          await supabase.auth.signOut();
          setMsg("This account is not authorized for Super Admin access.");
          return;
        }

        setCookie("prohive_super", "1");
        target = "/super/companies";
        role = "super_admin";
      }

      // COMPANY LOGIN
      if (mode === "company") {
        if (!hasSupabaseEnv()) {
          setMsg("Supabase is not configured. Please set env keys.");
          return;
        }

        const supabase = getSupabaseBrowserClient("company");
        if (!supabase) {
          setMsg("Supabase client is unavailable.");
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: e1,
          password: p1,
        });
        if (error || !data.user) {
          setMsg(error?.message || "Invalid Company Admin credentials.");
          return;
        }

        const { data: company, error: companyError } = await supabase
          .from("companies")
          .select("id,name,status,admin_email,company_logo_url")
          .eq("admin_email", e1)
          .maybeSingle();

        if (companyError || !company) {
          await supabase.auth.signOut();
          setMsg("This account is not mapped to any company admin.");
          return;
        }

        if (company.status === "suspended") {
          await supabase.auth.signOut();
          setMsg("Company is suspended. Contact super admin.");
          return;
        }

        const mustChangePassword = Boolean(data.user.user_metadata?.must_change_password);

        setCookie("prohive_company", "1");
        setCookie("prohive_company_id", company.id);
        target = mustChangePassword ? "/company/settings?forcePassword=1" : "/company/dashboard";
        role = "company_admin";

        localStorage.setItem(
          "phv_company",
          JSON.stringify({
            id: company.id,
            name: company.name,
            admin_email: company.admin_email,
            status: company.status,
            company_logo_url: company.company_logo_url || null,
          })
        );
        localStorage.setItem(
          "phv_company_session",
          JSON.stringify({
            role: "company_admin",
            email: e1,
            must_change_password: mustChangePassword,
          })
        );
      }

      if (!target || !role) return;

      // ✅ IMPORTANT: Set LocalStorage session BEFORE redirect
      if (mode === "super") {
        localStorage.setItem(
          "phv_super_session",
          JSON.stringify({
            role,
            email: e1,
          })
        );
      }

      // Redirect
      try {
        router.replace(target);
        setTimeout(() => {
          if (window.location.pathname !== target) hardNavigate(target);
        }, 150);
      } catch {
        hardNavigate(target);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_10%_20%,rgba(217,70,239,0.25),transparent_60%),radial-gradient(900px_500px_at_90%_80%,rgba(56,189,248,0.2),transparent_60%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:50px_50px]" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-8 px-6 lg:grid-cols-2 lg:px-10">
        <div className="hidden lg:block">
          <div className="mb-6">
            <h1 className="text-4xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-fuchsia-400 via-purple-300 to-sky-300 bg-clip-text text-transparent">
                PROHIVE
              </span>
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Workforce clarity, every day.
            </p>
          </div>

          <h2 className="text-3xl font-bold leading-tight">
            Enterprise-grade attendance & workforce platform
          </h2>

          <p className="mt-3 max-w-md text-sm text-white/70">
            Built for teams that demand accuracy, accountability and policy
            control.
          </p>

          <div className="mt-6 space-y-3">
            {features.map((f) => (
              <div
                key={f}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm backdrop-blur"
              >
                {f}
              </div>
            ))}
          </div>
        </div>

        <div className="flex w-full items-center justify-center">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-6 backdrop-blur shadow-2xl">
            <div className="text-xs tracking-widest text-white/50">
              PROHIVE ADMIN PORTAL
            </div>

            <h3 className="mt-2 text-2xl font-bold">{title}</h3>
            <p className="mt-1 text-sm text-white/70">{subtitle}</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-sm text-white/70">Email</label>
                <input
                  type="email"
                  className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-purple-500/40"
                  placeholder={mode === "super" ? "admin@prohive.com" : "hr@company.com"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="text-sm text-white/70">Password</label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-purple-500/40"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {msg && (
                <div className="rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-300">
                  {msg}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-purple-500 to-sky-400 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
              >
                {busy ? "Signing in..." : "Login"}
              </button>

              <div className="flex justify-between text-sm text-white/60">
                <button type="button" className="hover:text-white">
                  Forgot password?
                </button>

                {mode === "super" ? (
                  <Link href="/login" className="hover:text-white">
                    Company login
                  </Link>
                ) : (
                  <span className="text-white/40"> </span>
                )}
              </div>
            </form>

            <div className="mt-4 text-xs text-white/50">
              {mode === "super" ? "Use Supabase Auth credentials." : "Use company admin credentials provisioned by super admin."}
              <div className="mt-1">
                {mode === "super"
                  ? "Super: Login with authorized Supabase user"
                  : "Company: Login with company admin credentials created by super admin"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/45">
        © {new Date().getFullYear()} CatchRouteSolutions Pvt. Ltd.
      </div>
    </div>
  );
}
