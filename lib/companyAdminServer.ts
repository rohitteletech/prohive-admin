import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type CompanyAdminContext =
  | {
      ok: true;
      admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
      companyId: string;
      adminEmail: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function getCompanyAdminContext(token: string): Promise<CompanyAdminContext> {
  if (!token) {
    return { ok: false, status: 401, error: "Missing auth token." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) {
    return { ok: false, status: 500, error: "Supabase env is not configured." };
  }

  const authClient = createClient(url, anonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const email = authData.user?.email?.toLowerCase();
  if (authError || !email) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { ok: false, status: 500, error: "Supabase service role is not configured." };
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id,status,admin_email")
    .eq("admin_email", email)
    .maybeSingle();

  if (companyError || !company?.id) {
    return { ok: false, status: 403, error: "Company admin mapping not found." };
  }

  if (company.status === "suspended") {
    return { ok: false, status: 403, error: "Company is suspended." };
  }

  return {
    ok: true,
    admin,
    companyId: company.id,
    adminEmail: email,
  };
}
