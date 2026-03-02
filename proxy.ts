import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ allow public pages
  if (pathname === "/login" || pathname === "/super-login" || pathname === "/blocked") {
    return NextResponse.next();
  }

  // ✅ protect /super/*
  if (pathname.startsWith("/super")) {
    const superSession = req.cookies.get("prohive_super")?.value;
    if (superSession !== "1") {
      const url = req.nextUrl.clone();
      url.pathname = "/super-login";
      return NextResponse.redirect(url);
    }
  }

  // ✅ protect /company/*
  if (pathname.startsWith("/company")) {
    const companySession = req.cookies.get("prohive_company")?.value;
    if (companySession !== "1") {
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