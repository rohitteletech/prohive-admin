import { NextRequest, NextResponse } from "next/server";
import { formatDisplayDate } from "@/lib/dateTime";
import { getMobileSessionContext } from "@/lib/mobileSession";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    sessionToken?: string;
  };

  const session = await getMobileSessionContext({
    sessionToken: body.sessionToken,
  });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const [employeeResult, companyResult] = await Promise.all([
    session.admin
      .from("employees")
      .select(
        "id,employee_code,full_name,gender,mobile,email,designation,department,shift_name,status,joined_on,reporting_manager,perm_address,temp_address,emergency_name,emergency_mobile,employment_type,attendance_mode"
      )
      .eq("id", session.employee.id)
      .eq("company_id", session.employee.company_id)
      .maybeSingle(),
    session.admin.from("companies").select("name").eq("id", session.employee.company_id).maybeSingle(),
  ]);

  if (employeeResult.error) {
    return NextResponse.json({ error: employeeResult.error.message || "Unable to load profile." }, { status: 400 });
  }
  if (!employeeResult.data) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  if (companyResult.error) {
    return NextResponse.json({ error: companyResult.error.message || "Unable to load company profile." }, { status: 400 });
  }

  const employee = employeeResult.data as {
    id: string;
    employee_code: string;
    full_name: string;
    gender: "male" | "female" | "other" | null;
    mobile: string;
    email: string | null;
    designation: string;
    department: string | null;
    shift_name: string | null;
    status: "active" | "inactive";
    joined_on: string;
    reporting_manager: string | null;
    perm_address: string | null;
    temp_address: string | null;
    emergency_name: string | null;
    emergency_mobile: string | null;
    employment_type: "full_time" | "contract" | "intern" | null;
    attendance_mode: "office_only" | "field_staff";
  };

  return NextResponse.json({
    profile: {
      employeeId: employee.id,
      companyName: companyResult.data?.name || "",
      fullName: employee.full_name,
      employeeCode: employee.employee_code,
      gender: employee.gender,
      mobile: employee.mobile,
      email: employee.email,
      designation: employee.designation,
      department: employee.department,
      shiftName: employee.shift_name,
      status: employee.status,
      joinedOn: formatDisplayDate(employee.joined_on),
      reportingManager: employee.reporting_manager,
      permAddress: employee.perm_address,
      tempAddress: employee.temp_address,
      emergencyName: employee.emergency_name,
      emergencyMobile: employee.emergency_mobile,
      employmentType: employee.employment_type,
      attendanceMode: employee.attendance_mode,
    },
  });
}
