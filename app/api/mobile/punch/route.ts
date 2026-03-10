import { NextRequest, NextResponse } from "next/server";
import { submitMobilePunch } from "@/lib/mobilePunch";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      Date: new Date().toUTCString(),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return jsonResponse({ error: "Server is not configured." }, 500);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const result = await submitMobilePunch(admin, body);
  return jsonResponse(result.body, result.status);
}
