import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId")?.trim() || "";
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId." }, { status: 400 });
  }

  return NextResponse.json({ error: "Company logo is not configured." }, { status: 404 });
}
