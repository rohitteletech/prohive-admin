import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import { isAllowedMasterValue, normalizeMasterList } from "@/lib/companySettingsMasters";

type Body = {
  full_name?: string;
  email?: string;
  gender?: "male" | "female" | "other";
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
  aadhaar_number?: string;
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

function duplicateErrorKey(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  if (!candidate) return "";
  if (candidate.code !== "23505") return "";
  const message = String(candidate.message || "").toLowerCase();
  if (message.includes("employees_company_id_employee_code_key")) return "employee_code";
  if (message.includes("employees_company_id_mobile_key")) return "mobile";
  if (message.includes("duplicate key")) return "duplicate";
  return "";
}

export async function PUT(req: NextRequest, contextArg: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await contextArg.params;
  const body = (await req.json().catch(() => ({}))) as Body;

  const full_name = (body.full_name || "").trim();
  const employee_code = (body.employee_code || "").trim().toUpperCase();
  const mobile = String(body.mobile || "").replace(/\D/g, "").slice(0, 10);
  const designation = (body.designation || "").trim();
  const joined_on = (body.joined_on || "").trim();
  const gender = body.gender;
  const aadhaar_number = String(body.aadhaar_number || "").replace(/\D/g, "").slice(0, 12);

  if (!id) return NextResponse.json({ error: "Employee id is required." }, { status: 400 });
  if (!full_name) return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
  if (!employee_code) return NextResponse.json({ error: "Employee Code is required." }, { status: 400 });
  if (!mobile) return NextResponse.json({ error: "Mobile is required." }, { status: 400 });
  if (!/^\d{10}$/.test(mobile)) {
    return NextResponse.json({ error: "Mobile Number must be exactly 10 digits." }, { status: 400 });
  }
  if (gender !== undefined && gender !== "male" && gender !== "female" && gender !== "other") {
    return NextResponse.json({ error: "Invalid gender value." }, { status: 400 });
  }
  if (!designation) return NextResponse.json({ error: "Designation is required." }, { status: 400 });
  if (!joined_on) return NextResponse.json({ error: "Joining Date is required." }, { status: 400 });
  if (aadhaar_number && !/^\d{12}$/.test(aadhaar_number)) {
    return NextResponse.json({ error: "Aadhaar Number must be exactly 12 digits." }, { status: 400 });
  }
  const { data: duplicate } = await context.admin
    .from("employees")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("employee_code", employee_code)
    .neq("id", id)
    .maybeSingle();
  if (duplicate?.id) {
    return NextResponse.json({ error: "Employee Code already exists. Use a unique code." }, { status: 409 });
  }
  const { data: duplicateMobile } = await context.admin
    .from("employees")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("mobile", mobile)
    .neq("id", id)
    .maybeSingle();
  if (duplicateMobile?.id) {
    return NextResponse.json({ error: "Mobile already exists. Use a unique mobile number." }, { status: 409 });
  }

  const { data: companySettings, error: companySettingsError } = await context.admin
    .from("companies")
    .select("department_options,designation_options")
    .eq("id", context.companyId)
    .maybeSingle();
  if (companySettingsError) {
    return NextResponse.json(
      { error: companySettingsError.message || "Unable to validate company department and designation settings." },
      { status: 400 }
    );
  }

  const allowedDepartments = normalizeMasterList(companySettings?.department_options);
  const allowedDesignations = normalizeMasterList(companySettings?.designation_options);
  if (!isAllowedMasterValue(body.department, allowedDepartments)) {
    return NextResponse.json({ error: "Please select a valid department from Settings." }, { status: 400 });
  }
  if (!isAllowedMasterValue(body.designation, allowedDesignations)) {
    return NextResponse.json({ error: "Please select a valid designation from Settings." }, { status: 400 });
  }

  const payload = {
    full_name,
    email: normalizeOptional(body.email),
    gender: gender || null,
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
    aadhaar_number: aadhaar_number || null,
    emergency_name: normalizeOptional(body.emergency_name),
    emergency_mobile: normalizeOptional(body.emergency_mobile),
    employment_type: body.employment_type || null,
    exit_date: normalizeOptional(body.exit_date),
    attendance_mode: body.attendance_mode === "office_only" ? "office_only" : "field_staff",
  };

  const { data, error } = await context.admin
    .from("employees")
    .update(payload)
    .eq("company_id", context.companyId)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    const dupKey = duplicateErrorKey(error);
    if (dupKey === "employee_code") {
      return NextResponse.json({ error: "Employee Code already exists. Use a unique code." }, { status: 409 });
    }
    if (dupKey === "mobile") {
      return NextResponse.json({ error: "Mobile already exists. Use a unique mobile number." }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || "Unable to update employee." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
