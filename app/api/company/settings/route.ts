import { NextRequest, NextResponse } from "next/server";
import { getCompanyAdminContext } from "@/lib/companyAdminServer";

type Body = {
  office_lat?: number | null;
  office_lon?: number | null;
  office_radius_m?: number | null;
  company_logo_url?: string | null;
  company_logo_header_url?: string | null;
};

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLogoValue(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function isValidLogoValue(value: string) {
  if (!value) return true;
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value) || /^https?:\/\//.test(value);
}

function bytesFromDataUrl(value: string) {
  const match = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const base64 = match[1];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function isLogoWithinSizeLimit(value: string) {
  if (!value) return true;
  if (/^https?:\/\//.test(value)) return true;
  const bytes = bytesFromDataUrl(value);
  return bytes != null && bytes <= MAX_LOGO_BYTES;
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
    .select("office_lat,office_lon,office_radius_m,company_logo_url,company_logo_header_url")
    .eq("id", context.companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message || "Unable to load company settings." }, { status: 400 });
  }

  return NextResponse.json({
    office_lat: data?.office_lat ?? null,
    office_lon: data?.office_lon ?? null,
    office_radius_m: data?.office_radius_m ?? null,
    company_logo_url: data?.company_logo_url ?? null,
    company_logo_header_url: data?.company_logo_header_url ?? null,
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
  const hasLogoUpdate = Object.prototype.hasOwnProperty.call(body, "company_logo_url");
  const hasHeaderLogoUpdate = Object.prototype.hasOwnProperty.call(body, "company_logo_header_url");

  if (!hasAttendanceUpdate && !hasLogoUpdate && !hasHeaderLogoUpdate) {
    return NextResponse.json({ error: "No settings fields provided." }, { status: 400 });
  }

  const payload: {
    office_lat?: number | null;
    office_lon?: number | null;
    office_radius_m?: number | null;
    company_logo_url?: string | null;
    company_logo_header_url?: string | null;
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

  if (hasLogoUpdate) {
    const logo = normalizeLogoValue(body.company_logo_url);
    if (logo && !isValidLogoValue(logo)) {
      return NextResponse.json({ error: "Company logo must be a valid image upload." }, { status: 400 });
    }
    if (logo && !isLogoWithinSizeLimit(logo)) {
      return NextResponse.json({ error: "Company logo must be 2 MB or smaller." }, { status: 400 });
    }
    payload.company_logo_url = logo;
  }

  if (hasHeaderLogoUpdate) {
    const logo = normalizeLogoValue(body.company_logo_header_url);
    if (logo && !isValidLogoValue(logo)) {
      return NextResponse.json({ error: "Header logo must be a valid image upload." }, { status: 400 });
    }
    if (logo && !isLogoWithinSizeLimit(logo)) {
      return NextResponse.json({ error: "Header logo must be 2 MB or smaller." }, { status: 400 });
    }
    payload.company_logo_header_url = logo;
  }

  const { error } = await context.admin.from("companies").update(payload).eq("id", context.companyId);
  if (error) {
    return NextResponse.json({ error: error.message || "Unable to save company settings." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
