import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function superAdminAllowList() {
  const raw = process.env.SUPERADMIN_EMAILS || process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function authenticateSuperAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing auth token." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) {
    return { ok: false as const, status: 500, error: "Supabase env is not configured." };
  }

  const authClient = createClient(url, anonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user?.email) {
    return { ok: false as const, status: 401, error: "Unauthorized." };
  }

  const email = authData.user.email.toLowerCase();
  const allowed = superAdminAllowList();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return { ok: false as const, status: 403, error: "Not authorized for super admin actions." };
  }

  return { ok: true as const, email };
}

async function findAuthUserIdByEmail(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { userId: null, error: null as string | null };

  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { userId: null, error: error.message || "Unable to inspect auth users." };

    const users = data?.users || [];
    const matchedUser = users.find((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail) || null;
    if (matchedUser?.id) {
      return { userId: matchedUser.id, error: null as string | null };
    }

    if (users.length < perPage) break;
  }

  return { userId: null, error: null as string | null };
}

export async function DELETE(req: NextRequest, contextArg: { params: Promise<{ companyId: string }> }) {
  const auth = await authenticateSuperAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { companyId } = await contextArg.params;
  const normalizedCompanyId = String(companyId || "").trim();
  if (!normalizedCompanyId) {
    return NextResponse.json({ error: "Company id is required." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role key is missing or invalid. Use the service_role secret key." },
      { status: 500 }
    );
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id,name,code,admin_email")
    .eq("id", normalizedCompanyId)
    .maybeSingle();

  if (companyError) {
    return NextResponse.json({ error: companyError.message || "Unable to load company." }, { status: 400 });
  }
  if (!company?.id) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const authLookup = await findAuthUserIdByEmail(admin, String(company.admin_email || ""));
  if (authLookup.error) {
    return NextResponse.json({ error: authLookup.error }, { status: 500 });
  }

  if (authLookup.userId) {
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(authLookup.userId);
    if (deleteAuthError) {
      return NextResponse.json(
        { error: deleteAuthError.message || "Unable to delete company admin auth user." },
        { status: 400 }
      );
    }
  }

  const { error: deleteCompanyError } = await admin
    .from("companies")
    .delete()
    .eq("id", normalizedCompanyId);

  if (deleteCompanyError) {
    return NextResponse.json(
      {
        error: deleteCompanyError.message || "Unable to delete company after auth cleanup.",
        authAlreadyDeleted: Boolean(authLookup.userId),
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    deletedCompanyId: normalizedCompanyId,
    deletedCompanyName: company.name,
    deletedCompanyCode: company.code,
  });
}
