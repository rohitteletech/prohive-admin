import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDataImageUrl } from "@/lib/mobileCompanyLogo";

function decodeDataImage(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const base64 = match[2];
  try {
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length) return null;
    return { mimeType, bytes };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId")?.trim() || "";
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const { data, error } = await admin
    .from("companies")
    .select("company_logo_header_url")
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Unable to load company logo." }, { status: 400 });
  }

  const logo = (data?.company_logo_header_url || "").trim();
  if (!logo) {
    return NextResponse.json({ error: "Company logo not found." }, { status: 404 });
  }

  if (!isDataImageUrl(logo)) {
    return NextResponse.redirect(logo, { status: 307 });
  }

  const decoded = decodeDataImage(logo);
  if (!decoded) {
    return NextResponse.json({ error: "Company logo is invalid." }, { status: 400 });
  }

  return new NextResponse(decoded.bytes, {
    status: 200,
    headers: {
      "content-type": decoded.mimeType,
      "cache-control": "public, max-age=60",
    },
  });
}
