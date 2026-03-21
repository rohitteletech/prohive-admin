import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminSessionCookieName, verifyAdminSessionCookie } from "@/lib/adminSession";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifyAdminSessionCookie(req.cookies.get(getAdminSessionCookieName())?.value);

  // ✅ allow public pages
  if (pathname === "/login" || pathname === "/super-login" || pathname === "/blocked") {
    return NextResponse.next();
  }

  // ✅ protect /super/*
  if (pathname.startsWith("/super")) {
    if (session?.role !== "super_admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/super-login";
      return NextResponse.redirect(url);
    }
  }

  // ✅ protect /company/*
  if (pathname.startsWith("/company")) {
    if (session?.role !== "company_admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/super/:path*", "/company/:path*"],
};
