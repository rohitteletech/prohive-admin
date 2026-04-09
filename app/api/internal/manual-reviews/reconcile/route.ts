import { NextRequest, NextResponse } from "next/server";
import { ensurePendingPunchReviewCases } from "@/lib/manualReviewCases";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim() || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!cronSecret || bearerToken !== cronSecret) {
    return unauthorized();
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server is not configured." }, { status: 500 });
  }

  const result = await ensurePendingPunchReviewCases({ admin });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    touchedGroups: result.touchedGroups,
    reconciledAt: new Date().toISOString(),
  });
}
