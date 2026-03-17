import { NextRequest, NextResponse } from "next/server";

function legacyRemoved() {
  return NextResponse.json(
    {
      error: "Legacy shift settings API has been retired. Use the policy system instead.",
      redirectTo: "/company/settings/policies/shift-policy",
      bridgeApi: "/api/company/policies/shift-bridge",
    },
    { status: 410 },
  );
}

export async function GET(_req: NextRequest) {
  return legacyRemoved();
}

export async function PUT(_req: NextRequest) {
  return legacyRemoved();
}
