import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { getAttendanceReportData } from "@/lib/companyReportsAttendance";
import { INDIA_TIME_ZONE } from "@/lib/dateTime";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token, {
    companyIdHint: req.headers.get("x-company-id") || req.cookies.get("prohive_company_id")?.value || "",
  });
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const monthKey = String(req.nextUrl.searchParams.get("monthKey") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return NextResponse.json({ error: "Valid month is required." }, { status: 400 });
  }

  const result = await getAttendanceReportData({
    admin: context.admin,
    companyId: context.companyId,
    input: {
      mode: "monthly",
      monthKey,
      status: "manual_review",
      timeZone: INDIA_TIME_ZONE,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    rows: result.rows,
    summary: result.summary,
    scope: result.scope,
  });
}
