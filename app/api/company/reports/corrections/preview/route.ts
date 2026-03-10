import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { getCorrectionsReportData } from "@/lib/companyReportsCorrections";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const companyIdHint = req.headers.get("x-company-id") || req.cookies.get("prohive_company_id")?.value || "";
    const context = await getCompanyAdminContext(token, { companyIdHint });
    if (!context.ok) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      mode?: string;
      monthKey?: string;
      startDate?: string;
      endDate?: string;
      employeeQuery?: string;
      status?: string;
    };

    const result = await getCorrectionsReportData({
      admin: context.admin,
      companyId: context.companyId,
      input: body,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      rows: result.rows,
      summary: result.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected corrections preview error.";
    return NextResponse.json({ error: `Corrections preview crashed: ${message}` }, { status: 500 });
  }
}
