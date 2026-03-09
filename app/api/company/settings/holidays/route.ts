import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { holidayFromDb, sanitizeHolidays } from "@/lib/companyLeaves";
import { normalizeWeeklyOffPolicy, WEEKLY_OFF_POLICY_VALUES } from "@/lib/weeklyOff";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const [holidayResult, companyResult] = await Promise.all([
    context.admin
      .from("company_holidays")
      .select("id,holiday_date,name,type")
      .eq("company_id", context.companyId)
      .order("holiday_date", { ascending: true })
      .order("name", { ascending: true }),
    context.admin
      .from("companies")
      .select("weekly_off_policy,allow_punch_on_holiday,allow_punch_on_weekly_off")
      .eq("id", context.companyId)
      .maybeSingle(),
  ]);

  if (holidayResult.error) {
    return NextResponse.json({ error: holidayResult.error.message || "Unable to load holidays." }, { status: 400 });
  }
  if (companyResult.error) {
    return NextResponse.json({ error: companyResult.error.message || "Unable to load weekly off settings." }, { status: 400 });
  }

  return NextResponse.json({
    holidays: Array.isArray(holidayResult.data)
      ? holidayResult.data.map((row) => holidayFromDb(row as Record<string, unknown>))
      : [],
    weeklyOffPolicy: normalizeWeeklyOffPolicy(companyResult.data?.weekly_off_policy),
    allowPunchOnHoliday: companyResult.data?.allow_punch_on_holiday !== false,
    allowPunchOnWeeklyOff: companyResult.data?.allow_punch_on_weekly_off !== false,
    weeklyOffPolicyOptions: WEEKLY_OFF_POLICY_VALUES,
  });
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    holidays?: unknown;
    weeklyOffPolicy?: unknown;
    allowPunchOnHoliday?: unknown;
    allowPunchOnWeeklyOff?: unknown;
  };
  const hasHolidays = Object.prototype.hasOwnProperty.call(body, "holidays");
  const hasWeeklyOffPolicy = Object.prototype.hasOwnProperty.call(body, "weeklyOffPolicy");
  const hasAllowPunchOnHoliday = Object.prototype.hasOwnProperty.call(body, "allowPunchOnHoliday");
  const hasAllowPunchOnWeeklyOff = Object.prototype.hasOwnProperty.call(body, "allowPunchOnWeeklyOff");
  if (!hasHolidays && !hasWeeklyOffPolicy && !hasAllowPunchOnHoliday && !hasAllowPunchOnWeeklyOff) {
    return NextResponse.json({ error: "No holiday settings provided." }, { status: 400 });
  }

  let holidays = [] as ReturnType<typeof sanitizeHolidays>;
  if (hasHolidays) {
    try {
      holidays = sanitizeHolidays(body.holidays || []);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid holidays payload." },
        { status: 400 }
      );
    }
  }

  if (hasHolidays) {
    const { error: deleteError } = await context.admin
      .from("company_holidays")
      .delete()
      .eq("company_id", context.companyId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message || "Unable to replace holidays." }, { status: 400 });
    }
  }

  if (hasHolidays && holidays.length > 0) {
    const insertRows = holidays.map((row) => ({
      ...row,
      company_id: context.companyId,
    }));
    const { error: insertError } = await context.admin.from("company_holidays").insert(insertRows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message || "Unable to save holidays." }, { status: 400 });
    }
  }

  const companyUpdatePayload: Record<string, unknown> = {};

  if (hasWeeklyOffPolicy) {
    const weeklyOffPolicy = String(body.weeklyOffPolicy || "").trim();
    if (!WEEKLY_OFF_POLICY_VALUES.includes(weeklyOffPolicy as (typeof WEEKLY_OFF_POLICY_VALUES)[number])) {
      return NextResponse.json({ error: "Invalid weekly off policy." }, { status: 400 });
    }
    companyUpdatePayload.weekly_off_policy = weeklyOffPolicy;
  }

  if (hasAllowPunchOnHoliday) {
    companyUpdatePayload.allow_punch_on_holiday = Boolean(body.allowPunchOnHoliday);
  }

  if (hasAllowPunchOnWeeklyOff) {
    companyUpdatePayload.allow_punch_on_weekly_off = Boolean(body.allowPunchOnWeeklyOff);
  }

  if (Object.keys(companyUpdatePayload).length > 0) {
    const { error: companyUpdateError } = await context.admin.from("companies").update(companyUpdatePayload).eq("id", context.companyId);
    if (companyUpdateError) {
      return NextResponse.json({ error: companyUpdateError.message || "Unable to save holiday punch policy." }, { status: 400 });
    }
  }

  const [holidayResult, companyResult] = await Promise.all([
    context.admin
      .from("company_holidays")
      .select("id,holiday_date,name,type")
      .eq("company_id", context.companyId)
      .order("holiday_date", { ascending: true })
      .order("name", { ascending: true }),
    context.admin
      .from("companies")
      .select("weekly_off_policy,allow_punch_on_holiday,allow_punch_on_weekly_off")
      .eq("id", context.companyId)
      .maybeSingle(),
  ]);

  if (holidayResult.error) {
    return NextResponse.json({ error: holidayResult.error.message || "Unable to load saved holidays." }, { status: 400 });
  }
  if (companyResult.error) {
    return NextResponse.json({ error: companyResult.error.message || "Unable to load saved weekly off policy." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    holidays: Array.isArray(holidayResult.data)
      ? holidayResult.data.map((row) => holidayFromDb(row as Record<string, unknown>))
      : [],
    weeklyOffPolicy: normalizeWeeklyOffPolicy(companyResult.data?.weekly_off_policy),
    allowPunchOnHoliday: companyResult.data?.allow_punch_on_holiday !== false,
    allowPunchOnWeeklyOff: companyResult.data?.allow_punch_on_weekly_off !== false,
    weeklyOffPolicyOptions: WEEKLY_OFF_POLICY_VALUES,
  });
}
