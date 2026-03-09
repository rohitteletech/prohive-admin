import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { GovernmentHolidayState } from "@/lib/governmentHolidays";
import {
  governmentTemplateSuggestions,
  sanitizeGovernmentTemplateRows,
} from "@/lib/governmentHolidayTemplates";

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
  if (!token) return { ok: false as const, status: 401, error: "Missing auth token.", email: "" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) return { ok: false as const, status: 500, error: "Supabase env is not configured.", email: "" };

  const authClient = createClient(url, anonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const email = authData.user?.email?.trim().toLowerCase() || "";
  if (authError || !email) return { ok: false as const, status: 401, error: "Unauthorized.", email: "" };

  const allowed = superAdminAllowList();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return { ok: false as const, status: 403, error: "Not authorized for super admin actions.", email };
  }
  return { ok: true as const, status: 200, error: "", email };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthorizedAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role key is missing or invalid." }, { status: 500 });
  }

  const year = normalizeYear(req.nextUrl.searchParams.get("year"));
  const state = normalizeState(req.nextUrl.searchParams.get("state"));

  const { data: setRow, error: setError } = await admin
    .from("government_holiday_template_sets")
    .select("id,year,state,published,last_published_at,last_updated_at,updated_by")
    .eq("year", year)
    .eq("state", state)
    .maybeSingle();
  if (setError) {
    return NextResponse.json({ error: setError.message || "Unable to load template set." }, { status: 400 });
  }

  if (!setRow?.id) {
    return NextResponse.json({
      year,
      state,
      published: false,
      sourceMode: "default",
      rows: governmentTemplateSuggestions(year, state).map((row) => ({
        date: row.date,
        name: row.name,
        type: row.type,
        scope: row.scope,
      })),
    });
  }

  const { data: rowData, error: rowError } = await admin
    .from("government_holiday_template_rows")
    .select("holiday_date,name,type,scope")
    .eq("template_set_id", setRow.id)
    .order("holiday_date", { ascending: true })
    .order("name", { ascending: true });
  if (rowError) {
    return NextResponse.json({ error: rowError.message || "Unable to load template rows." }, { status: 400 });
  }

  return NextResponse.json({
    year,
    state,
    published: Boolean(setRow.published),
    sourceMode: "database",
    updatedBy: setRow.updated_by || "",
    lastUpdatedAt: setRow.last_updated_at || "",
    lastPublishedAt: setRow.last_published_at || "",
    rows: Array.isArray(rowData)
      ? rowData.map((row) => ({
        date: String(row.holiday_date || ""),
        name: String(row.name || ""),
        type: row.type === "national" ? "national" : "festival",
        scope: row.scope === "state" ? "state" : "national",
      }))
      : [],
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthorizedAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role key is missing or invalid." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    year?: unknown;
    state?: unknown;
    rows?: unknown;
    publish?: unknown;
  };

  const year = normalizeYear(body.year);
  const state = normalizeState(body.state);
  const publish = body.publish === true;
  let rows = [] as ReturnType<typeof sanitizeGovernmentTemplateRows>;
  try {
    rows = sanitizeGovernmentTemplateRows(body.rows || []);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid template rows." }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "At least one holiday row is required." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("government_holiday_template_sets")
    .select("id,published,last_published_at")
    .eq("year", year)
    .eq("state", state)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message || "Unable to load existing template set." }, { status: 400 });
  }

  let setId = String(existing?.id || "");
  if (!setId) {
    const { data: createdSet, error: createSetError } = await admin
      .from("government_holiday_template_sets")
      .insert({
        year,
        state,
        published: publish,
        last_published_at: publish ? nowIso : null,
        last_updated_at: nowIso,
        updated_by: auth.email,
      })
      .select("id")
      .single();
    if (createSetError || !createdSet?.id) {
      return NextResponse.json({ error: createSetError?.message || "Unable to create template set." }, { status: 400 });
    }
    setId = String(createdSet.id);
  } else {
    const nextPublished = publish ? true : Boolean(existing?.published);
    const { error: updateSetError } = await admin
      .from("government_holiday_template_sets")
      .update({
        published: nextPublished,
        last_published_at: publish ? nowIso : existing?.last_published_at || null,
        last_updated_at: nowIso,
        updated_by: auth.email,
      })
      .eq("id", setId);
    if (updateSetError) {
      return NextResponse.json({ error: updateSetError.message || "Unable to update template set." }, { status: 400 });
    }
  }

  const { error: deleteRowsError } = await admin
    .from("government_holiday_template_rows")
    .delete()
    .eq("template_set_id", setId);
  if (deleteRowsError) {
    return NextResponse.json({ error: deleteRowsError.message || "Unable to replace template rows." }, { status: 400 });
  }

  const { error: insertRowsError } = await admin
    .from("government_holiday_template_rows")
    .insert(rows.map((row) => ({
      template_set_id: setId,
      holiday_date: row.date,
      name: row.name,
      type: row.type,
      scope: row.scope,
      created_at: nowIso,
      updated_at: nowIso,
    })));
  if (insertRowsError) {
    return NextResponse.json({ error: insertRowsError.message || "Unable to save template rows." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
