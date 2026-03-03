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

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

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
  const email = normalizeEmail(authData.user?.email);
  if (authError || !email) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { ok: false, status: 500, error: "Supabase service role is not configured." };
  }

  const { data: companies, error: companyError } = await admin
    .from("companies")
    .select("id,status,admin_email")
    .not("admin_email", "is", null);

  if (companyError) {
    return { ok: false, status: 403, error: "Company admin mapping not found." };
  }

  const company =
    (companies as Array<{ id: string; status: string; admin_email: string | null }> | null)?.find(
      (row) => normalizeEmail(row.admin_email) === email
    ) || null;

  if (!company?.id) {
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
