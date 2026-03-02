import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";

type PlanType = "trial" | "monthly" | "yearly";

function toISODateLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return toISODateLocal(d);
}

function superAdminAllowList() {
  const raw = process.env.SUPERADMIN_EMAILS || process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
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
  if (authError || !authData.user?.email) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const allowed = superAdminAllowList();
  const email = authData.user.email.toLowerCase();
  if (allowed.length > 0 && !allowed.includes(email)) {
    return NextResponse.json({ error: "Not authorized for super admin actions." }, { status: 403 });
  }

  const body = (await req.json()) as {
    companyName?: string;
    companyCode?: string;
    sizeOfEmployees?: string;
    authorizedName?: string;
    mobile?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    pinCode?: string;
    plan?: PlanType;
    adminEmail?: string;
    adminPassword?: string;
    gst?: string;
    businessNature?: string;
  };

  const name = (body.companyName || "").trim();
  const plan = body.plan || "trial";
  const adminEmail = (body.adminEmail || "").trim().toLowerCase();
  const adminPassword = (body.adminPassword || "").trim();
  if (!name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  if (!adminEmail) return NextResponse.json({ error: "Admin email is required." }, { status: 400 });
  if (!adminPassword) return NextResponse.json({ error: "Admin password is required." }, { status: 400 });

  const todayDate = new Date();
  const today = toISODateLocal(todayDate);
  const durationDays = plan === "trial" ? 7 : plan === "monthly" ? 37 : 372;
  const planEnd = addDaysISO(todayDate, durationDays);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase service role key is missing or invalid. Use the service_role secret key." },
      { status: 500 }
    );
  }

  const { data: createdAuth, error: createAuthError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: {
      role: "company_admin",
      must_change_password: true,
    },
  });
  if (createAuthError || !createdAuth.user) {
    return NextResponse.json({ error: createAuthError?.message || "Unable to create company admin user." }, { status: 400 });
  }

  const payload = {
    name,
    code: (body.companyCode || "").trim() || null,
    plan_type: plan,
    plan_start: today,
    plan_end: planEnd,
    status: plan === "trial" ? "trial_active" : "paid_active",
    size_of_employees: body.sizeOfEmployees || null,
    authorized_name: (body.authorizedName || "").trim() || null,
    mobile: (body.mobile || "").trim() || null,
    address: (body.address || "").trim() || null,
    city: (body.city || "").trim() || null,
    state: (body.state || "").trim() || null,
    country: (body.country || "").trim() || null,
    pin_code: (body.pinCode || "").trim() || null,
    admin_email: adminEmail,
    admin_password: null,
    gst: (body.gst || "").trim() || null,
    business_nature: (body.businessNature || "").trim() || null,
  };

  const { error } = await admin.from("companies").insert(payload);
  if (error) {
    await admin.auth.admin.deleteUser(createdAuth.user.id).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
