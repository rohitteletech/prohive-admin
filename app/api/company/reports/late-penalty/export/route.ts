import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { getLatePenaltyReportData, toLatePenaltyCsv } from "@/lib/companyReportsLatePenalty";

function normalizeFilenameDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "range";
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const companyIdHint = req.headers.get("x-company-id") || req.cookies.get("prohive_company_id")?.value || "";
    const body = (await req.json().catch(() => ({}))) as {
      mode?: string;
      monthKey?: string;
      startDate?: string;
      endDate?: string;
      employeeQuery?: string;
      department?: string;
      status?: string;
      timeZone?: string;
    };

    const context = await getCompanyAdminContext(token, { companyIdHint });
    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const result = await getLatePenaltyReportData({
      admin: context.admin,
      companyId: context.companyId,
      input: body,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const csv = toLatePenaltyCsv(result.rows);
    const startDate = normalizeFilenameDate(result.scope.startDate);
    const endDate = normalizeFilenameDate(result.scope.endDate);
    const filename = `late-penalty-report_${startDate}_to_${endDate}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to export late penalty CSV." },
      { status: 500 }
    );
  }
}
