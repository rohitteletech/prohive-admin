import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { resolveLeaveTypesRuntime } from "@/lib/companyPolicyRuntime";
import { ensureCompanyPolicyDefinitions } from "@/lib/companyPoliciesServer";

const VIRTUAL_COMP_OFF_CODE = "COMP-OFF";

type Body = {
  employee_id?: string;
  leave_policy_code?: string;
  year?: number;
  extra_days?: number;
  reason?: string;
};

function normalizeText(value?: string) {
  return String(value || "").trim();
}

function normalizeCode(value?: string) {
  return normalizeText(value).toUpperCase();
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const yearParam = Number(req.nextUrl.searchParams.get("year") || new Date().getFullYear());
  const year = Number.isFinite(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : new Date().getFullYear();

  const [overrideResult, employeeResult, definitions] = await Promise.all([
    context.admin
      .from("employee_leave_balance_overrides")
      .select("id,employee_id,leave_policy_code,year,extra_days,reason,created_by,created_at,updated_at,employees(full_name,employee_code)")
      .eq("company_id", context.companyId)
      .eq("year", year)
      .order("updated_at", { ascending: false }),
    context.admin
      .from("employees")
      .select("id,full_name,employee_code,status")
      .eq("company_id", context.companyId)
      .order("full_name", { ascending: true }),
    ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail),
  ]);

  if (overrideResult.error) {
    return NextResponse.json({ error: overrideResult.error.message || "Unable to load leave overrides." }, { status: 400 });
  }
  if (employeeResult.error) {
    return NextResponse.json({ error: employeeResult.error.message || "Unable to load employees." }, { status: 400 });
  }
  const policiesByCode = new Map<string, { code: string; name: string; active: boolean }>();
  definitions
    .filter((definition) => definition.policyType === "leave")
    .forEach((definition) => {
      resolveLeaveTypesRuntime(definition).forEach((leaveType) => {
        const existing = policiesByCode.get(leaveType.code);
        policiesByCode.set(leaveType.code, {
          code: leaveType.code,
          name: existing?.name || leaveType.name,
          active: Boolean(existing?.active) || definition.status === "active",
        });
      });
    });
  const policies = Array.from(policiesByCode.values()).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    year,
    rows: (overrideResult.data || []).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      employeeName: (row.employees as { full_name?: string } | null)?.full_name || "",
      employeeCode: (row.employees as { employee_code?: string } | null)?.employee_code || "",
      leavePolicyCode: row.leave_policy_code,
      year: Number(row.year || year),
      extraDays: Number(row.extra_days || 0),
      reason: row.reason || "",
      createdBy: row.created_by || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
    })),
    employees: (employeeResult.data || []).map((row) => ({
      id: row.id,
      name: row.full_name || "",
      employeeCode: row.employee_code || "",
      status: row.status || "active",
    })),
    policies,
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const employeeId = normalizeText(body.employee_id);
  const leavePolicyCode = normalizeCode(body.leave_policy_code);
  const reason = normalizeText(body.reason);
  const year = Number(body.year || new Date().getFullYear());
  const extraDays = Number(body.extra_days || 0);

  if (!employeeId) return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  if (!leavePolicyCode) return NextResponse.json({ error: "Leave type is required." }, { status: 400 });
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return NextResponse.json({ error: "Year is invalid." }, { status: 400 });
  if (!Number.isFinite(extraDays)) return NextResponse.json({ error: "Override days is invalid." }, { status: 400 });
  if (extraDays < -365 || extraDays > 365) return NextResponse.json({ error: "Override days must be between -365 and 365." }, { status: 400 });
  if (reason.length < 5 || reason.length > 300) {
    return NextResponse.json({ error: "Reason must be 5 to 300 characters." }, { status: 400 });
  }

  const { data: employee, error: employeeError } = await context.admin
    .from("employees")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeError || !employee?.id) {
    return NextResponse.json({ error: employeeError?.message || "Employee not found." }, { status: 400 });
  }

  if (leavePolicyCode !== VIRTUAL_COMP_OFF_CODE) {
    const definitions = await ensureCompanyPolicyDefinitions(context.admin, context.companyId, context.adminEmail);
    const policyExists = definitions
      .filter((definition) => definition.policyType === "leave")
      .some((definition) => resolveLeaveTypesRuntime(definition).some((leaveType) => leaveType.code === leavePolicyCode));
    if (!policyExists) {
      return NextResponse.json({ error: "Leave policy not found." }, { status: 400 });
    }
  }

  const { data: existing } = await context.admin
    .from("employee_leave_balance_overrides")
    .select("id,extra_days")
    .eq("company_id", context.companyId)
    .eq("employee_id", employeeId)
    .eq("leave_policy_code", leavePolicyCode)
    .eq("year", year)
    .maybeSingle();

  if (existing?.id) {
    const { error: updateError } = await context.admin
      .from("employee_leave_balance_overrides")
      .update({
        extra_days: extraDays,
        reason,
        created_by: context.adminEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", context.companyId)
      .eq("id", existing.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message || "Unable to update leave override." }, { status: 400 });
    }

    await context.admin.from("employee_leave_balance_override_audit_logs").insert({
      override_id: existing.id,
      company_id: context.companyId,
      employee_id: employeeId,
      leave_policy_code: leavePolicyCode,
      year,
      action: "updated",
      old_extra_days: Number(existing.extra_days || 0),
      new_extra_days: extraDays,
      reason,
      changed_by: context.adminEmail,
      changed_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, id: existing.id, action: "updated" });
  }

  const { data: created, error: insertError } = await context.admin
    .from("employee_leave_balance_overrides")
    .insert({
      company_id: context.companyId,
      employee_id: employeeId,
      leave_policy_code: leavePolicyCode,
      year,
      extra_days: extraDays,
      reason,
      created_by: context.adminEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !created?.id) {
    return NextResponse.json({ error: insertError?.message || "Unable to create leave override." }, { status: 400 });
  }

  await context.admin.from("employee_leave_balance_override_audit_logs").insert({
    override_id: created.id,
    company_id: context.companyId,
    employee_id: employeeId,
    leave_policy_code: leavePolicyCode,
    year,
    action: "created",
    old_extra_days: null,
    new_extra_days: extraDays,
    reason,
    changed_by: context.adminEmail,
    changed_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, id: created.id, action: "created" });
}
