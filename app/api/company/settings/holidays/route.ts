import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { holidayFromDb, sanitizeHolidays } from "@/lib/companyLeaves";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.admin
    .from("company_holidays")
    .select("id,holiday_date,name,type")
    .eq("company_id", context.companyId)
    .order("holiday_date", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load holidays." }, { status: 400 });
  }

  return NextResponse.json({
    holidays: Array.isArray(data) ? data.map((row) => holidayFromDb(row as Record<string, unknown>)) : [],
  });
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as { holidays?: unknown };

  let holidays;
  try {
    holidays = sanitizeHolidays(body.holidays || []);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid holidays payload." }, { status: 400 });
  }

  const { error: deleteError } = await context.admin
    .from("company_holidays")
    .delete()
    .eq("company_id", context.companyId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Unable to replace holidays." }, { status: 400 });
  }

  if (holidays.length > 0) {
    const insertRows = holidays.map((row) => ({
      ...row,
      company_id: context.companyId,
    }));
    const { error: insertError } = await context.admin.from("company_holidays").insert(insertRows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message || "Unable to save holidays." }, { status: 400 });
    }
  }

  const { data, error } = await context.admin
    .from("company_holidays")
    .select("id,holiday_date,name,type")
    .eq("company_id", context.companyId)
    .order("holiday_date", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load saved holidays." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    holidays: Array.isArray(data) ? data.map((row) => holidayFromDb(row as Record<string, unknown>)) : [],
  });
}
