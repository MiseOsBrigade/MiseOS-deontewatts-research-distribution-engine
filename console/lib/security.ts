import { createHash, timingSafeEqual } from "node:crypto";

const attempts = new Map<string, { count: number; resetAt: number }>();

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

export function verifyIntakeKey(request: Request) {
  const expected = process.env.UPLOAD_API_KEY?.trim();
  if (!expected) throw new Error("UPLOAD_API_KEY is not configured.");

  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return Boolean(supplied) && timingSafeEqual(hash(supplied), hash(expected));
}

export function enforceRateLimit(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const limit = Number(process.env.UPLOAD_RATE_LIMIT || 10);
  const windowMs = Number(process.env.UPLOAD_RATE_WINDOW_MS || 60000);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) throw new Error("Upload rate limit exceeded.");
  current.count += 1;
}

export function assertAllowedOrigin(request: Request) {
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length === 0) return;

  const origin = request.headers.get("origin");
  if (!origin || !configured.includes(origin)) throw new Error("Origin is not allowed.");
}
