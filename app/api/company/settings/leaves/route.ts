import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { leavePolicyFromDb, sanitizeLeavePolicies } from "@/lib/companyLeaves";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.admin
    .from("company_leave_policies")
    .select("id,name,code,annual_quota,carry_forward,encashable,active")
    .eq("company_id", context.companyId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load leave policies." }, { status: 400 });
  }

  return NextResponse.json({
    policies: Array.isArray(data) ? data.map((row) => leavePolicyFromDb(row as Record<string, unknown>)) : [],
  });
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as { policies?: unknown };

  let policies;
  try {
    policies = sanitizeLeavePolicies(body.policies || []);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid leave policy payload." }, { status: 400 });
  }

  const { error: deleteError } = await context.admin
    .from("company_leave_policies")
    .delete()
    .eq("company_id", context.companyId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message || "Unable to replace leave policies." }, { status: 400 });
  }

  if (policies.length > 0) {
    const insertRows = policies.map((row) => ({
      ...row,
      company_id: context.companyId,
    }));
    const { error: insertError } = await context.admin.from("company_leave_policies").insert(insertRows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message || "Unable to save leave policies." }, { status: 400 });
    }
  }

  const { data, error } = await context.admin
    .from("company_leave_policies")
    .select("id,name,code,annual_quota,carry_forward,encashable,active")
    .eq("company_id", context.companyId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load saved leave policies." }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    policies: Array.isArray(data) ? data.map((row) => leavePolicyFromDb(row as Record<string, unknown>)) : [],
  });
}
