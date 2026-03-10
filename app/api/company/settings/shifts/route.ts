import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { DEFAULT_COMPANY_SHIFTS } from "@/lib/companyShifts";
import { sanitizeCompanyShiftRows, shiftFromDb, shiftToDb } from "@/lib/companyShiftDefinitions";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.admin
    .from("company_shift_definitions")
    .select("id,name,type,start_time,end_time,grace_mins,early_window_mins,min_work_before_out_mins,active")
    .eq("company_id", context.companyId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load shift definitions." }, { status: 400 });
  }

  const rows = Array.isArray(data) && data.length > 0 ? data.map((row) => shiftFromDb(row as never)) : DEFAULT_COMPANY_SHIFTS;
  return NextResponse.json({ rows });
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as { rows?: unknown };
  let rows = DEFAULT_COMPANY_SHIFTS;

  try {
    rows = sanitizeCompanyShiftRows(body.rows || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid shift definitions payload." },
      { status: 400 }
    );
  }

  const { error: deleteError } = await context.admin
    .from("company_shift_definitions")
    .delete()
    .eq("company_id", context.companyId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Unable to replace shift definitions." }, { status: 400 });
  }

  const insertRows = rows.map((row) => shiftToDb(row, context.companyId));
  const { data, error } = await context.admin
    .from("company_shift_definitions")
    .insert(insertRows)
    .select("id,name,type,start_time,end_time,grace_mins,early_window_mins,min_work_before_out_mins,active")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to save shift definitions." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    rows: Array.isArray(data) ? data.map((row) => shiftFromDb(row as never)) : rows,
  });
}
