import { NextResponse } from "next/server";
import { clearAdminSessionCookieOptions } from "@/lib/adminSession";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearAdminSessionCookieOptions());
  response.cookies.set({
    name: "prohive_company_id",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
