import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GovernmentHolidayState } from "@/lib/governmentHolidays";
import { importOfficialIndiaHolidays } from "@/lib/officialHolidayImport";

function normalizeYear(value: unknown) {
  const numeric = Number(value || "");
  if (!Number.isFinite(numeric)) return new Date().getFullYear();
  return Math.max(2000, Math.min(2100, Math.floor(numeric)));
}

function normalizeState(value: unknown): GovernmentHolidayState {
  if (value === "maharashtra" || value === "karnataka" || value === "gujarat" || value === "tamil_nadu") return value;
  return "all_india";
}

function superAdminAllowList() {
  const raw = process.env.SUPERADMIN_EMAILS || process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

async function getAuthorizedAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { ok: false as const, status: 401, error: "Missing auth token." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) return { ok: false as const, status: 500, error: "Supabase env is not configured." };

  const authClient = createClient(url, anonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const email = authData.user?.email?.trim().toLowerCase() || "";
  if (authError || !email) return { ok: false as const, status: 401, error: "Unauthorized." };

  const allowed = superAdminAllowList();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return { ok: false as const, status: 403, error: "Not authorized for super admin actions." };
  }
  return { ok: true as const, status: 200, error: "" };
}

export async function POST(req: NextRequest) {
  const auth = await getAuthorizedAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    year?: unknown;
    state?: unknown;
  };

  const year = normalizeYear(body.year);
  const state = normalizeState(body.state);

  try {
    const rows = await importOfficialIndiaHolidays(year, state);
    return NextResponse.json({
      ok: true,
      sourceMode: "official",
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import official holidays." },
      { status: 400 }
    );
  }
}
