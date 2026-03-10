import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { getEmployeesReportData } from "@/lib/companyReportsEmployees";

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
      department?: string;
      status?: string;
    };

    const result = await getEmployeesReportData({
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
    const message = error instanceof Error ? error.message : "Unexpected employee report preview error.";
    return NextResponse.json({ error: `Employee report preview crashed: ${message}` }, { status: 500 });
  }
}
