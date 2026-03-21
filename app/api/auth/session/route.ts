import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminSessionCookie, getAdminSessionCookieName, getAdminSessionMaxAgeSeconds } from "@/lib/adminSession";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function getSuperAdminAllowList() {
  const raw = process.env.SUPERADMIN_EMAILS || process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      mode?: "super" | "company";
      companyId?: string;
    };

    const token = (body.token || "").trim();
    const mode = body.mode;
    const companyIdHint = (body.companyId || "").trim();

    if (!token || (mode !== "super" && mode !== "company")) {
      return NextResponse.json({ error: "Invalid session request." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Supabase env is not configured." }, { status: 500 });
    }

    if (mode === "super") {
      const authClient = createClient(url, anonKey);
      const { data, error } = await authClient.auth.getUser(token);
      const email = normalizeEmail(data.user?.email);
      if (error || !email) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }

      const allowed = getSuperAdminAllowList();
      if (allowed.length > 0 && !allowed.includes(email)) {
        return NextResponse.json({ error: "Not authorized for super admin access." }, { status: 403 });
      }

      const sessionCookie = await createAdminSessionCookie({
        role: "super_admin",
        email,
      });
      if (!sessionCookie) {
        return NextResponse.json({ error: "Session signing secret is not configured." }, { status: 500 });
      }

      const response = NextResponse.json({ ok: true });
      response.cookies.set({
        name: getAdminSessionCookieName(),
        value: sessionCookie,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: getAdminSessionMaxAgeSeconds(),
      });
      return response;
    }

    const context = await getCompanyAdminContext(token, { companyIdHint });
    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const sessionCookie = await createAdminSessionCookie({
      role: "company_admin",
      email: context.adminEmail,
      companyId: context.companyId,
    });
    if (!sessionCookie) {
      return NextResponse.json({ error: "Session signing secret is not configured." }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true, companyId: context.companyId });
    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: sessionCookie,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAdminSessionMaxAgeSeconds(),
    });
    response.cookies.set({
      name: "prohive_company_id",
      value: context.companyId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAdminSessionMaxAgeSeconds(),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected session setup error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
