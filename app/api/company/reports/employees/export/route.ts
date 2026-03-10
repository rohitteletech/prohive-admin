import { NextRequest } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { getEmployeesReportData, toEmployeesCsv } from "@/lib/companyReportsEmployees";

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
      department?: string;
      status?: string;
    };

    const result = await getEmployeesReportData({
      admin: context.admin,
      companyId: context.companyId,
      input: body,
    });

    if (!result.ok) {
      return new Response(result.error, { status: result.status });
    }

    const csv = toEmployeesCsv(result.rows);
    const filename = `employee-master_${result.scope.startDate}_to_${result.scope.endDate}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected employee export error.";
    return new Response(`Employee export crashed: ${message}`, { status: 500 });
  }
}
