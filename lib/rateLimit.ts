type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSec: number; resetAt: number };

function nowMs() {
  return Date.now();
}

function cleanupExpired(now: number) {
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) rateLimitStore.delete(key);
  }
}

export function applyRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = nowMs();
  cleanupExpired(now);

  const existing = rateLimitStore.get(config.key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(config.key, { count: 1, resetAt });
    return { ok: true, remaining: Math.max(config.limit - 1, 0), resetAt };
  }

  if (existing.count >= config.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  rateLimitStore.set(config.key, existing);
  return { ok: true, remaining: Math.max(config.limit - existing.count, 0), resetAt: existing.resetAt };
}

export function getRequestClientIp(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for") || "";
  const firstForwardedIp = forwardedFor.split(",")[0]?.trim();
  return firstForwardedIp || headers.get("x-real-ip") || "unknown";
}
