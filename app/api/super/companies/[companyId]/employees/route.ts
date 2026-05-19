import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type CompanyRow = {
  id: string;
  name: string | null;
  code: string | null;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  mobile: string | null;
  status: string | null;
  mobile_app_status: string | null;
  bound_device_name: string | null;
  bound_app_version: string | null;
  bound_device_id: string | null;
  bound_device_at: string | null;
  mobile_last_login_at: string | null;
};

type PunchRow = {
  employee_id: string | null;
  server_received_at: string | null;
};

function superAdminAllowList() {
  const raw = process.env.SUPERADMIN_EMAILS || process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function authenticateSuperAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing auth token." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) {
    return { ok: false as const, status: 500, error: "Supabase env is not configured." };
  }

  const authClient = createClient(url, anonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user?.email) {
    return { ok: false as const, status: 401, error: "Unauthorized." };
  }

  const email = authData.user.email.toLowerCase();
  const allowed = superAdminAllowList();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return { ok: false as const, status: 403, error: "Not authorized for super admin actions." };
  }

  return { ok: true as const };
}

export async function GET(req: NextRequest, contextArg: { params: Promise<{ companyId: string }> }) {
  const auth = await authenticateSuperAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { companyId } = await contextArg.params;
  const normalizedCompanyId = String(companyId || "").trim();
  if (!normalizedCompanyId) {
    return NextResponse.json({ error: "Company id is required." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role key is missing or invalid. Use the service_role secret key." },
      { status: 500 }
    );
  }

  const { data: companyData, error: companyError } = await admin
    .from("companies")
    .select("id,name,code")
    .eq("id", normalizedCompanyId)
    .maybeSingle();
  const company = (companyData || null) as CompanyRow | null;

  if (companyError) {
    return NextResponse.json({ error: companyError.message || "Unable to load company." }, { status: 400 });
  }
  if (!company?.id) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data: employeeData, error: employeeError } = await admin
    .from("employees")
    .select(
      "id,full_name,employee_code,mobile,status,mobile_app_status,bound_device_name,bound_app_version,bound_device_id,bound_device_at,mobile_last_login_at"
    )
    .eq("company_id", normalizedCompanyId)
    .order("created_at", { ascending: false });

  if (employeeError) {
    return NextResponse.json({ error: employeeError.message || "Unable to load employees." }, { status: 400 });
  }

  const rows = Array.isArray(employeeData) ? (employeeData as EmployeeRow[]) : [];
  const employeeIds = rows.map((row) => row.id).filter(Boolean);

  const lastPunchByEmployee = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: punchData, error: punchError } = await admin
      .from("attendance_punch_events")
      .select("employee_id,server_received_at")
      .eq("company_id", normalizedCompanyId)
      .in("employee_id", employeeIds)
      .order("server_received_at", { ascending: false });

    if (punchError) {
      return NextResponse.json({ error: punchError.message || "Unable to load employee punch history." }, { status: 400 });
    }

    for (const row of (Array.isArray(punchData) ? punchData : []) as PunchRow[]) {
      const employeeId = String(row.employee_id || "");
      if (!employeeId || lastPunchByEmployee.has(employeeId)) continue;
      lastPunchByEmployee.set(employeeId, String(row.server_received_at || ""));
    }
  }

  return NextResponse.json({
    company,
    rows: rows.map((row) => ({
      ...row,
      last_punch_at: lastPunchByEmployee.get(row.id) || null,
    })),
  });
}
