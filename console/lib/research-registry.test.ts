import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UploadMetadata } from "@/lib/github";
import { registerResearchMetadata } from "@/lib/research-registry";

const ORIGINAL_ENV = { ...process.env };

function metadata(overrides: Partial<UploadMetadata> = {}): UploadMetadata {
  return {
    title: "A Study",
    description: "Desc",
    creators: [{ name: "Ada Lovelace", orcid: "0000-0002-1825-0097" }],
    keywords: ["math"],
    license: "cc-by-4.0",
    upload_type: "dataset",
    publication_type: "article",
    publication_date: "2024-05-01",
    access_right: "open",
    related_identifiers: [],
    ...overrides,
  };
}

function mockFetch(response: {
  ok: boolean;
  status?: number;
  body?: unknown;
  throwOnJson?: boolean;
}) {
  const fn = vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => {
      if (response.throwOnJson) throw new Error("invalid json");
      return response.body ?? {};
    },
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  process.env.THREEMIN_API_URL = "https://registry.test/records";
  process.env.THREEMIN_API_KEY = "key-123";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("registerResearchMetadata", () => {
  it("reports not configured when the endpoint is missing", async () => {
    delete process.env.THREEMIN_API_URL;
    const result = await registerResearchMetadata(metadata());
    expect(result).toEqual({ configured: false, accepted: false });
  });

  it("reports not configured when the API key is missing", async () => {
    delete process.env.THREEMIN_API_KEY;
    const result = await registerResearchMetadata(metadata());
    expect(result).toEqual({ configured: false, accepted: false });
  });

  it("posts a mapped payload with bearer auth to the endpoint", async () => {
    const fetchFn = mockFetch({ ok: true, body: { id: "rec-42" } });
    await registerResearchMetadata(metadata());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://registry.test/records");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key-123");
    expect(JSON.parse(init.body as string)).toEqual({
      title: "A Study",
      record_type: "article",
      creator: "Ada Lovelace",
      orcid: "0000-0002-1825-0097",
      publication_date: "2024-05-01",
    });
  });

  it("returns the record id on success", async () => {
    mockFetch({ ok: true, body: { id: "rec-42" } });
    const result = await registerResearchMetadata(metadata());
    expect(result).toEqual({ configured: true, accepted: true, recordId: "rec-42" });
  });

  it("omits recordId when the response has no id", async () => {
    mockFetch({ ok: true, body: {} });
    const result = await registerResearchMetadata(metadata());
    expect(result).toEqual({ configured: true, accepted: true });
  });

  it("falls back to upload_type when publication_type is absent", async () => {
    const fetchFn = mockFetch({ ok: true, body: { id: "x" } });
    await registerResearchMetadata(metadata({ publication_type: undefined }));
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).record_type).toBe("dataset");
  });

  it("uses placeholders when the first creator lacks name/orcid", async () => {
    const fetchFn = mockFetch({ ok: true, body: { id: "x" } });
    await registerResearchMetadata(metadata({ creators: [{ name: "" }] }));
    const payload = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(payload.creator).toBe("Unknown creator");
    expect(payload.orcid).toBe("not-provided");
  });

  it("surfaces the registry error message on a non-ok response", async () => {
    mockFetch({ ok: false, status: 422, body: { error: "bad payload" } });
    const result = await registerResearchMetadata(metadata());
    expect(result).toEqual({ configured: true, accepted: false, error: "bad payload" });
  });

  it("builds a status-based error when the body has no message", async () => {
    mockFetch({ ok: false, status: 503, body: {} });
    const result = await registerResearchMetadata(metadata());
    expect(result).toEqual({
      configured: true,
      accepted: false,
      error: "Registry returned HTTP 503.",
    });
  });

  it("captures thrown fetch errors as an accepted:false result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const result = await registerResearchMetadata(metadata());
    expect(result).toEqual({ configured: true, accepted: false, error: "network down" });
  });
});
