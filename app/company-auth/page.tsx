"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient, hasSupabaseEnv } from "@/lib/supabase/client";

type CompanyRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  admin_email: string;
  authorized_name: string | null;
  company_tagline: string | null;
};

async function establishServerSession(input: { token: string; companyId: string }) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: input.token,
      mode: "company",
      companyId: input.companyId,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Unable to create secure company session.");
  }
}

function hardNavigate(path: string) {
  window.location.assign(path);
}

export default function CompanyAuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Login link verifying...");
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!hasSupabaseEnv()) {
      setError("Supabase is not configured.");
      setMessage("Unable to continue.");
      return;
    }

    const supabaseClient = getSupabaseBrowserClient("company");
    if (!supabaseClient) {
      setError("Supabase client is unavailable.");
      setMessage("Unable to continue.");
      return;
    }
    const supabase = supabaseClient;

    let active = true;

    async function completeSignIn() {
      if (!active || completedRef.current) return false;

      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data.session;
      const accessToken = session?.access_token || "";
      const email = session?.user?.email?.trim().toLowerCase() || "";

      if (!accessToken || !email) return false;

      const { data: companyRows, error: companyError } = await supabase
        .from("companies")
        .select("id,name,code,status,admin_email,authorized_name,company_tagline")
        .eq("admin_email", email)
        .order("created_at", { ascending: false })
        .limit(2);

      if (companyError) {
        throw new Error(companyError.message || "Unable to load company admin mapping.");
      }
      if (!companyRows || companyRows.length === 0) {
        throw new Error("This account is not mapped to any company admin.");
      }
      if (companyRows.length > 1) {
        throw new Error("Multiple companies are mapped to this admin email. Contact super admin.");
      }

      const company = companyRows[0] as CompanyRow;
      if (company.status === "suspended") {
        throw new Error("Company is suspended. Contact super admin.");
      }

      await establishServerSession({ token: accessToken, companyId: company.id });

      const mustChangePassword = Boolean(session?.user?.user_metadata?.must_change_password);

      localStorage.setItem(
        "phv_company",
        JSON.stringify({
          id: company.id,
          name: company.name,
          code: company.code,
          admin_email: company.admin_email,
          status: company.status,
          authorized_name: company.authorized_name,
          company_tagline: company.company_tagline,
        })
      );
      localStorage.setItem(
        "phv_company_session",
        JSON.stringify({
          role: "company_admin",
          email,
          must_change_password: mustChangePassword,
        })
      );

      completedRef.current = true;
      const target = mustChangePassword ? "/company/settings?forcePassword=1" : "/company/dashboard";
      setMessage("Login verified. Redirecting...");

      try {
        router.replace(target);
        window.setTimeout(() => {
          if (window.location.pathname + window.location.search !== target) {
            hardNavigate(target);
          }
        }, 200);
      } catch {
        hardNavigate(target);
      }

      return true;
    }

    const attempt = async () => {
      try {
        const done = await completeSignIn();
        if (!done && active) {
          setMessage("Waiting for secure login confirmation...");
        }
      } catch (err) {
        if (!active) return;
        const text = err instanceof Error ? err.message : "Unable to complete company admin login.";
        setError(text);
        setMessage("Login link could not be completed.");
      }
    };

    void attempt();

    const subscription = supabase.auth.onAuthStateChange(() => {
      void attempt();
    });

    const timeout = window.setTimeout(() => {
      if (!completedRef.current && active && !error) {
        setError("Login link expired or invalid. Please ask super admin to create the company again or resend access.");
        setMessage("Login link could not be completed.");
      }
    }, 10000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.data.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-bold">Company Admin Access</h1>
        <p className="mt-3 text-sm text-white/70">{message}</p>
        {error ? <div className="mt-5 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      </div>
    </div>
  );
}
