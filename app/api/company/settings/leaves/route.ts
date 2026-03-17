import { NextRequest, NextResponse } from "next/server";

function legacyRemoved() {
  return NextResponse.json(
    {
      error: "Legacy leave settings API has been retired. Use the policy system instead.",
      redirectTo: "/company/settings/policies/leave-policy",
      bridgeApi: "/api/company/policies/leave-bridge",
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
