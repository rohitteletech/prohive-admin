import { NextRequest } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { getCorrectionsReportData, toCorrectionsCsv } from "@/lib/companyReportsCorrections";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const companyIdHint = req.headers.get("x-company-id") || req.cookies.get("prohive_company_id")?.value || "";
    const context = await getCompanyAdminContext(token, { companyIdHint });
    if (!context.ok) {
      return new Response(context.error, { status: context.status });
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
      return new Response(result.error, { status: result.status });
    }

    const csv = toCorrectionsCsv(result.rows);
    const filename = `corrections-report_${result.scope.startDate}_to_${result.scope.endDate}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected corrections export error.";
    return new Response(`Corrections export crashed: ${message}`, { status: 500 });
  }
}
