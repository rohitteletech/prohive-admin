import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type CompanyDetailRow = {
  id: string;
  name: string | null;
  code: string | null;
  size_of_employees: string | null;
  authorized_name: string | null;
  mobile: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pin_code: string | null;
  plan_type: string | null;
  plan_start: string | null;
  plan_end: string | null;
  status: string | null;
  admin_email: string | null;
  gst: string | null;
  business_nature: string | null;
  company_tagline: string | null;
  created_at: string | null;
};

type CompanyDeleteRow = {
  id: string;
  name: string | null;
  code: string | null;
  admin_email: string | null;
};

type CompanyUpdatePayload = {
  authorized_name?: unknown;
  mobile?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  pin_code?: unknown;
  gst?: unknown;
  business_nature?: unknown;
};

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

function normalizeOptionalText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeMobile(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 10);
  if (!digits) return null;
  if (digits.length !== 10) return { error: "Mobile must be a 10-digit number." };
  return { value: digits };
}

function normalizePinCode(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 6);
  if (!digits) return null;
  if (digits.length !== 6) return { error: "PIN code must be a 6-digit number." };
  return { value: digits };
}

export async function GET(req: NextRequest, contextArg: { params: Promise<{ companyId: string }> }) {
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

  const { data, error: companyError } = await admin
    .from("companies")
    .select(
      [
        "id",
        "name",
        "code",
        "size_of_employees",
        "authorized_name",
        "mobile",
        "address",
        "city",
        "state",
        "country",
        "pin_code",
        "plan_type",
        "plan_start",
        "plan_end",
        "status",
        "admin_email",
        "gst",
        "business_nature",
        "company_tagline",
        "created_at",
      ].join(",")
    )
    .eq("id", normalizedCompanyId)
    .maybeSingle();
  const company = (data || null) as CompanyDetailRow | null;

  if (companyError) {
    return NextResponse.json({ error: companyError.message || "Unable to load company." }, { status: 400 });
  }
  if (!company?.id) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  return NextResponse.json({ company });
}

export async function PATCH(req: NextRequest, contextArg: { params: Promise<{ companyId: string }> }) {
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

  const body = (await req.json().catch(() => null)) as CompanyUpdatePayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mobileResult = normalizeMobile(body.mobile);
  if (mobileResult && "error" in mobileResult) {
    return NextResponse.json({ error: mobileResult.error }, { status: 400 });
  }

  const pinResult = normalizePinCode(body.pin_code);
  if (pinResult && "error" in pinResult) {
    return NextResponse.json({ error: pinResult.error }, { status: 400 });
  }

  const payload = {
    authorized_name: normalizeOptionalText(body.authorized_name, 120),
    mobile: mobileResult && "value" in mobileResult ? mobileResult.value : null,
    address: normalizeOptionalText(body.address, 240),
    city: normalizeOptionalText(body.city, 120),
    state: normalizeOptionalText(body.state, 120),
    country: normalizeOptionalText(body.country, 120),
    pin_code: pinResult && "value" in pinResult ? pinResult.value : null,
    gst: normalizeOptionalText(body.gst, 30),
    business_nature: normalizeOptionalText(body.business_nature, 120),
  };

  const { data, error } = await admin
    .from("companies")
    .update(payload)
    .eq("id", normalizedCompanyId)
    .select(
      [
        "id",
        "name",
        "code",
        "size_of_employees",
        "authorized_name",
        "mobile",
        "address",
        "city",
        "state",
        "country",
        "pin_code",
        "plan_type",
        "plan_start",
        "plan_end",
        "status",
        "admin_email",
        "gst",
        "business_nature",
        "company_tagline",
        "created_at",
      ].join(",")
    )
    .maybeSingle();

  const company = (data || null) as CompanyDetailRow | null;

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to update company." }, { status: 400 });
  }
  if (!company?.id) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, company });
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

  const { data, error: companyError } = await admin
    .from("companies")
    .select("id,name,code,admin_email")
    .eq("id", normalizedCompanyId)
    .maybeSingle();
  const company = (data || null) as CompanyDeleteRow | null;

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
