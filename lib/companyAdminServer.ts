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

export async function getCompanyAdminContext(
  token: string,
  options?: { companyIdHint?: string | null }
): Promise<CompanyAdminContext> {
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

  const { data: companyByEmailRows, error: companyError } = await admin
    .from("companies")
    .select("id,status,admin_email")
    .eq("admin_email", email)
    .order("created_at", { ascending: false })
    .limit(2);

  if (companyError) {
    return { ok: false, status: 400, error: companyError.message || "Unable to load company admin mapping." };
  }

  if (companyByEmailRows && companyByEmailRows.length > 1) {
    return { ok: false, status: 409, error: `Multiple company mappings found for ${email}.` };
  }

  let company = companyByEmailRows?.[0] || null;

  const hintedCompanyId = (options?.companyIdHint || "").trim();
  if (!company?.id && hintedCompanyId) {
    const { data: companyById, error: companyByIdError } = await admin
      .from("companies")
      .select("id,status,admin_email")
      .eq("id", hintedCompanyId)
      .maybeSingle();

    if (companyByIdError) {
      return { ok: false, status: 400, error: companyByIdError.message || "Unable to load company admin mapping." };
    }

    if (companyById?.id && normalizeEmail(companyById.admin_email) === email) {
      company = companyById;
    }
  }

  if (!company?.id) {
    return { ok: false, status: 403, error: `Company admin mapping not found for ${email || "unknown user"}.` };
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
