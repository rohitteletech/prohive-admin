import { NextRequest } from "next/server";

const DATA_IMAGE_PREFIX = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

export function resolveRequestOrigin(req: NextRequest) {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host")?.trim();
  if (host) {
    return `${forwardedProto || "https"}://${host}`;
  }

  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  if (envOrigin) {
    return envOrigin.replace(/\/+$/, "");
  }

  return "";
}

export function buildCompanyLogoUrl(input: {
  logoValue: string | null | undefined;
  companyId: string;
  requestOrigin?: string;
}) {
  const logo = (input.logoValue || "").trim();
  if (!logo) return null;
  if (!DATA_IMAGE_PREFIX.test(logo)) return logo;

  if (!input.requestOrigin) return logo;
  const encodedCompanyId = encodeURIComponent(input.companyId);
  return `${input.requestOrigin}/api/mobile/company/logo?companyId=${encodedCompanyId}`;
}

export function isDataImageUrl(value: string | null | undefined) {
  return DATA_IMAGE_PREFIX.test((value || "").trim());
}
