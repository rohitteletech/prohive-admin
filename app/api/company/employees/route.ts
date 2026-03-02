import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";

type Body = {
  full_name?: string;
  email?: string;
  employee_code?: string;
  mobile?: string;
  designation?: string;
  department?: string;
  shift_name?: string;
  status?: "active" | "inactive";
  joined_on?: string;
  reporting_manager?: string;
  perm_address?: string;
  temp_address?: string;
  pan?: string;
  aadhaar_last4?: string;
  emergency_name?: string;
  emergency_mobile?: string;
  employment_type?: "full_time" | "contract" | "intern";
  exit_date?: string;
  attendance_mode?: "office_only" | "field_staff";
};

function normalizeOptional(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as Body;

  const full_name = (body.full_name || "").trim();
  const employee_code = (body.employee_code || "").trim().toUpperCase();
  const mobile = (body.mobile || "").trim();
  const designation = (body.designation || "").trim();
  const joined_on = (body.joined_on || "").trim();

  if (!full_name) return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
  if (!employee_code) return NextResponse.json({ error: "Employee Code is required." }, { status: 400 });
  if (!mobile) return NextResponse.json({ error: "Mobile is required." }, { status: 400 });
  if (!designation) return NextResponse.json({ error: "Designation is required." }, { status: 400 });
  if (!joined_on) return NextResponse.json({ error: "Joining Date is required." }, { status: 400 });

  const payload = {
    company_id: context.companyId,
    full_name,
    email: normalizeOptional(body.email),
    employee_code,
    mobile,
    designation,
    department: normalizeOptional(body.department),
    shift_name: normalizeOptional(body.shift_name),
    status: body.status === "inactive" ? "inactive" : "active",
    joined_on,
    reporting_manager: normalizeOptional(body.reporting_manager),
    perm_address: normalizeOptional(body.perm_address),
    temp_address: normalizeOptional(body.temp_address),
    pan: normalizeOptional(body.pan),
    aadhaar_last4: normalizeOptional(body.aadhaar_last4),
    emergency_name: normalizeOptional(body.emergency_name),
    emergency_mobile: normalizeOptional(body.emergency_mobile),
    employment_type: body.employment_type || null,
    exit_date: normalizeOptional(body.exit_date),
    attendance_mode: body.attendance_mode === "office_only" ? "office_only" : "field_staff",
  };

  const { data, error } = await context.admin.from("employees").insert(payload).select("id").single();
  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message || "Unable to create employee." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
