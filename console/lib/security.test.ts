import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertAllowedOrigin, enforceRateLimit, verifyIntakeKey } from "@/lib/security";

const ORIGINAL_ENV = { ...process.env };

function request(headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/upload", { headers });
}

let ipCounter = 0;
function uniqueIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

describe("verifyIntakeKey", () => {
  it("throws when UPLOAD_API_KEY is not configured", () => {
    delete process.env.UPLOAD_API_KEY;
    expect(() => verifyIntakeKey(request({ authorization: "Bearer x" }))).toThrow(
      "UPLOAD_API_KEY is not configured.",
    );
  });

  it("returns true for a matching bearer token", () => {
    process.env.UPLOAD_API_KEY = "s3cret";
    expect(verifyIntakeKey(request({ authorization: "Bearer s3cret" }))).toBe(true);
  });

  it("returns false for a wrong token", () => {
    process.env.UPLOAD_API_KEY = "s3cret";
    expect(verifyIntakeKey(request({ authorization: "Bearer nope" }))).toBe(false);
  });

  it("returns false when no authorization header is present", () => {
    process.env.UPLOAD_API_KEY = "s3cret";
    expect(verifyIntakeKey(request())).toBe(false);
  });

  it("returns false when the scheme is not Bearer", () => {
    process.env.UPLOAD_API_KEY = "s3cret";
    expect(verifyIntakeKey(request({ authorization: "Basic s3cret" }))).toBe(false);
  });

  it("trims surrounding whitespace from the configured key and supplied token", () => {
    process.env.UPLOAD_API_KEY = "  spaced  ";
    expect(verifyIntakeKey(request({ authorization: "Bearer   spaced  " }))).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  it("allows requests up to the configured limit then throws", () => {
    process.env.UPLOAD_RATE_LIMIT = "3";
    const ip = uniqueIp();
    const headers = { "x-forwarded-for": ip };
    expect(() => enforceRateLimit(request(headers))).not.toThrow();
    expect(() => enforceRateLimit(request(headers))).not.toThrow();
    expect(() => enforceRateLimit(request(headers))).not.toThrow();
    expect(() => enforceRateLimit(request(headers))).toThrow("Upload rate limit exceeded.");
  });

  it("tracks separate counts per client IP", () => {
    process.env.UPLOAD_RATE_LIMIT = "1";
    const a = uniqueIp();
    const b = uniqueIp();
    expect(() => enforceRateLimit(request({ "x-forwarded-for": a }))).not.toThrow();
    expect(() => enforceRateLimit(request({ "x-forwarded-for": b }))).not.toThrow();
    expect(() => enforceRateLimit(request({ "x-forwarded-for": a }))).toThrow();
  });

  it("uses the first entry of a comma-separated x-forwarded-for chain", () => {
    process.env.UPLOAD_RATE_LIMIT = "1";
    const client = uniqueIp();
    expect(() => enforceRateLimit(request({ "x-forwarded-for": `${client}, 172.16.0.1` }))).not.toThrow();
    expect(() => enforceRateLimit(request({ "x-forwarded-for": `${client}, 192.168.1.1` }))).toThrow();
  });

  it("resets the count after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    process.env.UPLOAD_RATE_LIMIT = "1";
    process.env.UPLOAD_RATE_WINDOW_MS = "1000";
    const ip = uniqueIp();
    const headers = { "x-forwarded-for": ip };
    expect(() => enforceRateLimit(request(headers))).not.toThrow();
    expect(() => enforceRateLimit(request(headers))).toThrow();
    vi.advanceTimersByTime(1001);
    expect(() => enforceRateLimit(request(headers))).not.toThrow();
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    process.env.UPLOAD_RATE_LIMIT = "1";
    const ip = uniqueIp();
    expect(() => enforceRateLimit(request({ "x-real-ip": ip }))).not.toThrow();
    expect(() => enforceRateLimit(request({ "x-real-ip": ip }))).toThrow();
  });
});

describe("assertAllowedOrigin", () => {
  it("does nothing when no origins are configured", () => {
    delete process.env.ALLOWED_ORIGINS;
    expect(() => assertAllowedOrigin(request({ origin: "https://anything.test" }))).not.toThrow();
  });

  it("allows a configured origin", () => {
    process.env.ALLOWED_ORIGINS = "https://a.test, https://b.test";
    expect(() => assertAllowedOrigin(request({ origin: "https://b.test" }))).not.toThrow();
  });

  it("rejects an origin that is not in the allowlist", () => {
    process.env.ALLOWED_ORIGINS = "https://a.test";
    expect(() => assertAllowedOrigin(request({ origin: "https://evil.test" }))).toThrow(
      "Origin is not allowed.",
    );
  });

  it("rejects a request with no origin header when an allowlist exists", () => {
    process.env.ALLOWED_ORIGINS = "https://a.test";
    expect(() => assertAllowedOrigin(request())).toThrow("Origin is not allowed.");
  });
});
