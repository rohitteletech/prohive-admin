import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";
import {
  MAX_MASTER_ITEM_LENGTH,
  MAX_MASTER_ITEMS,
  isAllowedMasterValue,
  normalizeMasterList,
} from "@/lib/companySettingsMasters";

type Body = {
  office_lat?: number | null;
  office_lon?: number | null;
  office_radius_m?: number | null;
  company_tagline?: string | null;
  department_options?: string[] | null;
  designation_options?: string[] | null;
};

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeTagline(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.admin
    .from("companies")
    .select("office_lat,office_lon,office_radius_m,company_tagline,department_options,designation_options")
    .eq("id", context.companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load company settings." }, { status: 400 });
  }

  return NextResponse.json({
    office_lat: data?.office_lat ?? null,
    office_lon: data?.office_lon ?? null,
    office_radius_m: data?.office_radius_m ?? null,
    company_tagline: data?.company_tagline ?? null,
    department_options: normalizeMasterList(data?.department_options),
    designation_options: normalizeMasterList(data?.designation_options),
  });
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const context = await getCompanyAdminContext(token);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const hasOfficeLat = Object.prototype.hasOwnProperty.call(body, "office_lat");
  const hasOfficeLon = Object.prototype.hasOwnProperty.call(body, "office_lon");
  const hasOfficeRadiusM = Object.prototype.hasOwnProperty.call(body, "office_radius_m");
  const hasAttendanceUpdate = hasOfficeLat || hasOfficeLon || hasOfficeRadiusM;
  const hasTaglineUpdate = Object.prototype.hasOwnProperty.call(body, "company_tagline");
  const hasDepartmentUpdate = Object.prototype.hasOwnProperty.call(body, "department_options");
  const hasDesignationUpdate = Object.prototype.hasOwnProperty.call(body, "designation_options");
  if (!hasAttendanceUpdate && !hasTaglineUpdate && !hasDepartmentUpdate && !hasDesignationUpdate) {
    return NextResponse.json({ error: "No settings fields provided." }, { status: 400 });
  }

  const payload: {
    office_lat?: number | null;
    office_lon?: number | null;
    office_radius_m?: number | null;
    company_tagline?: string | null;
    department_options?: string[];
    designation_options?: string[];
  } = {};

  if (hasAttendanceUpdate) {
    const officeLat = normalizeNumber(body.office_lat);
    const officeLon = normalizeNumber(body.office_lon);
    const officeRadiusM = normalizeNumber(body.office_radius_m);

    const isAllBlank = officeLat == null && officeLon == null && officeRadiusM == null;
    const isAllPresent = officeLat != null && officeLon != null && officeRadiusM != null;
    if (!isAllBlank && !isAllPresent) {
      return NextResponse.json(
        { error: "Office latitude, longitude, and radius must be provided together." },
        { status: 400 }
      );
    }

    if (officeLat != null && (officeLat < -90 || officeLat > 90)) {
      return NextResponse.json({ error: "Office latitude is invalid." }, { status: 400 });
    }
    if (officeLon != null && (officeLon < -180 || officeLon > 180)) {
      return NextResponse.json({ error: "Office longitude is invalid." }, { status: 400 });
    }
    if (officeRadiusM != null && (officeRadiusM < 10 || officeRadiusM > 5000)) {
      return NextResponse.json({ error: "Office radius must be between 10 and 5000 meters." }, { status: 400 });
    }

    payload.office_lat = officeLat;
    payload.office_lon = officeLon;
    payload.office_radius_m = officeRadiusM == null ? null : Math.round(officeRadiusM);
  }

  if (hasTaglineUpdate) {
    const tagline = normalizeTagline(body.company_tagline);
    if (tagline && tagline.length > 100) {
      return NextResponse.json({ error: "Company tagline must be 100 characters or less." }, { status: 400 });
    }
    payload.company_tagline = tagline;
  }

  if (hasDepartmentUpdate) {
    const departments = normalizeMasterList(body.department_options);
    if (Array.isArray(body.department_options) && body.department_options.length > MAX_MASTER_ITEMS) {
      return NextResponse.json({ error: `You can add up to ${MAX_MASTER_ITEMS} departments.` }, { status: 400 });
    }
    if (
      Array.isArray(body.department_options)
      && body.department_options.some((item) => typeof item === "string" && item.trim().length > MAX_MASTER_ITEM_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Each department must be ${MAX_MASTER_ITEM_LENGTH} characters or less.` },
        { status: 400 }
      );
    }
    payload.department_options = departments;
  }

  if (hasDesignationUpdate) {
    const designations = normalizeMasterList(body.designation_options);
    if (Array.isArray(body.designation_options) && body.designation_options.length > MAX_MASTER_ITEMS) {
      return NextResponse.json({ error: `You can add up to ${MAX_MASTER_ITEMS} designations.` }, { status: 400 });
    }
    if (
      Array.isArray(body.designation_options)
      && body.designation_options.some((item) => typeof item === "string" && item.trim().length > MAX_MASTER_ITEM_LENGTH)
    ) {
      return NextResponse.json(
        { error: `Each designation must be ${MAX_MASTER_ITEM_LENGTH} characters or less.` },
        { status: 400 }
      );
    }
    payload.designation_options = designations;
  }

  if (hasDepartmentUpdate || hasDesignationUpdate) {
    const nextDepartments = hasDepartmentUpdate
      ? payload.department_options || []
      : normalizeMasterList(
          (
            await context.admin
              .from("companies")
              .select("department_options")
              .eq("id", context.companyId)
              .maybeSingle()
          ).data?.department_options
        );
    const nextDesignations = hasDesignationUpdate
      ? payload.designation_options || []
      : normalizeMasterList(
          (
            await context.admin
              .from("companies")
              .select("designation_options")
              .eq("id", context.companyId)
              .maybeSingle()
          ).data?.designation_options
        );

    const { data: employeeRows, error: employeeError } = await context.admin
      .from("employees")
      .select("department,designation")
      .eq("company_id", context.companyId);

    if (employeeError) {
      return NextResponse.json(
        { error: employeeError.message || "Unable to validate employee master data usage." },
        { status: 400 }
      );
    }

    const rows = Array.isArray(employeeRows) ? employeeRows : [];
    const invalidDepartment = rows.find((row) => {
      const value = typeof row.department === "string" ? row.department : "";
      return value.trim() && !isAllowedMasterValue(value, nextDepartments);
    });
    if (invalidDepartment) {
      return NextResponse.json(
        { error: `Cannot remove department in use by employees: ${String(invalidDepartment.department).trim()}` },
        { status: 400 }
      );
    }

    const invalidDesignation = rows.find((row) => {
      const value = typeof row.designation === "string" ? row.designation : "";
      return value.trim() && !isAllowedMasterValue(value, nextDesignations);
    });
    if (invalidDesignation) {
      return NextResponse.json(
        { error: `Cannot remove designation in use by employees: ${String(invalidDesignation.designation).trim()}` },
        { status: 400 }
      );
    }
  }

  const { error } = await context.admin.from("companies").update(payload).eq("id", context.companyId);
  if (error) {
    return NextResponse.json({ error: error.message || "Unable to save company settings." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
