import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimRowFromDb } from "@/lib/companyClaims";

function superAdminAllowList() {
  const raw = process.env.SUPERADMIN_EMAILS || process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase env is not configured." }, { status: 500 });
  }

  const authClient = createClient(url, anonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const email = authData.user?.email?.trim().toLowerCase() || "";
  if (authError || !email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const allowed = superAdminAllowList();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return NextResponse.json({ error: "Not authorized for super admin actions." }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role key is missing or invalid." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("employee_claim_requests")
    .select(
      "id,company_id,employee_id,from_date,to_date,days,claim_type,claim_type_other_text,amount,reason,attachment_url,status,admin_remark,submitted_at"
      + ",employees(full_name,employee_code),companies(name)"
    )
    .order("submitted_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load super claims." }, { status: 400 });
  }

  const rows = Array.isArray(data)
    ? data.map((row) => {
        const source = row as unknown as Record<string, unknown>;
        const mapped = claimRowFromDb(source);
        const company = (source.companies || {}) as Record<string, unknown>;
        return {
          ...mapped,
          companyId: String(source.company_id || ""),
          companyName: String(company.name || ""),
        };
      })
    : [];

  return NextResponse.json({
    rows,
    stats: {
      total: rows.length,
      pending: rows.filter((row) => row.status === "pending").length,
      approved: rows.filter((row) => row.status === "approved").length,
      rejected: rows.filter((row) => row.status === "rejected").length,
    },
  });
}
