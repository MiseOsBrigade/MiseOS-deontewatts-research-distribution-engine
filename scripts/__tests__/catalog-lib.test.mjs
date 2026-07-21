import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  INDEX_PATH,
  createRecordId,
  metadataFingerprint,
  readJson,
  recordSummary,
  sha256,
  slugify,
  upsertIndexRecord,
  writeJson,
} from "../catalog-lib.mjs";

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "catalog-lib-test-"));
}

describe("slugify", () => {
  it("lowercases and hyphenates non-alphanumeric runs", () => {
    assert.equal(slugify("Hello World! Foo"), "hello-world-foo");
  });

  it("collapses repeated separators and trims leading/trailing hyphens", () => {
    assert.equal(slugify("  --A / B__C--  "), "a-b-c");
  });

  it("decomposes diacritics via NFKD (combining marks become separators)", () => {
    // toLowerCase runs before NFKD, so the decomposed combining mark is dropped
    // as a non-alphanumeric separator rather than merged into the base letter.
    assert.equal(slugify("Café Über"), "cafe-u-ber");
  });

  it("truncates to 48 characters", () => {
    const result = slugify("a".repeat(100));
    assert.equal(result.length, 48);
    assert.equal(result, "a".repeat(48));
  });

  it("falls back to 'record' when nothing usable remains", () => {
    assert.equal(slugify("!!!"), "record");
    assert.equal(slugify(""), "record");
  });
});

describe("createRecordId", () => {
  it("uses YYYY-MM-DD-<slug>-<10 hex digest> shape", () => {
    const id = createRecordId("My Title");
    assert.match(id, /^\d{4}-\d{2}-\d{2}-my-title-[0-9a-f]{10}$/);
  });

  it("is deterministic for the same title and seed", () => {
    assert.equal(createRecordId("Same", "seed"), createRecordId("Same", "seed"));
  });

  it("changes the digest when the seed changes", () => {
    const a = createRecordId("Same", "seed-a");
    const b = createRecordId("Same", "seed-b");
    assert.notEqual(a.slice(-10), b.slice(-10));
  });

  it("matches an independently computed digest", () => {
    const title = "Reproducible Title";
    const seed = "abc";
    const expected = crypto.createHash("sha256").update(`${title}\n${seed}`).digest("hex").slice(0, 10);
    assert.ok(createRecordId(title, seed).endsWith(expected));
  });
});

describe("sha256", () => {
  it("hashes file contents", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "payload.bin");
    fs.writeFileSync(file, "content");
    const expected = crypto.createHash("sha256").update(Buffer.from("content")).digest("hex");
    assert.equal(sha256(file), expected);
  });
});

describe("readJson / writeJson", () => {
  it("returns the fallback when the file is missing", () => {
    const dir = makeTmpDir();
    assert.equal(readJson(path.join(dir, "nope.json")), null);
    assert.deepEqual(readJson(path.join(dir, "nope.json"), { a: 1 }), { a: 1 });
  });

  it("round-trips a value with trailing newline and 2-space indent", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "nested", "value.json");
    const value = { b: 2, a: [1, 2] };
    writeJson(file, value);
    const raw = fs.readFileSync(file, "utf8");
    assert.equal(raw, `${JSON.stringify(value, null, 2)}\n`);
    assert.deepEqual(readJson(file), value);
  });

  it("creates missing parent directories", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "deep", "tree", "x.json");
    writeJson(file, { ok: true });
    assert.ok(fs.existsSync(file));
  });

  it("does not leave a temp file behind", () => {
    const dir = makeTmpDir();
    writeJson(path.join(dir, "v.json"), { ok: true });
    const leftovers = fs.readdirSync(dir).filter((name) => name.includes(".tmp"));
    assert.deepEqual(leftovers, []);
  });
});

describe("metadataFingerprint", () => {
  const baseRecord = {
    title: "T",
    description: "D",
    creators: [{ name: "A" }],
    keywords: ["k"],
    license: "cc-by-4.0",
    upload_type: "dataset",
    publication_type: undefined,
    publication_date: "2024-01-01",
    access_right: "open",
    related_identifiers: [],
  };

  it("is stable for the same inputs", () => {
    assert.equal(
      metadataFingerprint(baseRecord, "deadbeef"),
      metadataFingerprint({ ...baseRecord }, "deadbeef"),
    );
  });

  it("changes when the canonical checksum changes", () => {
    assert.notEqual(
      metadataFingerprint(baseRecord, "aaaa"),
      metadataFingerprint(baseRecord, "bbbb"),
    );
  });

  it("changes when a fingerprinted metadata field changes", () => {
    assert.notEqual(
      metadataFingerprint(baseRecord, "same"),
      metadataFingerprint({ ...baseRecord, title: "Different" }, "same"),
    );
  });

  it("ignores fields outside the fingerprint set (e.g. status, updated_at)", () => {
    assert.equal(
      metadataFingerprint({ ...baseRecord, status: "draft", updated_at: "x" }, "same"),
      metadataFingerprint(baseRecord, "same"),
    );
  });

  it("treats missing keywords/related_identifiers as empty arrays", () => {
    const { keywords, related_identifiers, ...withoutArrays } = baseRecord;
    assert.equal(
      metadataFingerprint({ ...withoutArrays, keywords: [], related_identifiers: [] }, "same"),
      metadataFingerprint(withoutArrays, "same"),
    );
  });
});

describe("recordSummary", () => {
  it("projects the summary fields and derives record_path", () => {
    const summary = recordSummary({
      id: "rec-1",
      kind: "dataset",
      title: "Title",
      creators: [{ name: "A" }],
      identifiers: { doi: "10.x/y" },
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
      extra: "ignored",
    });
    assert.deepEqual(summary, {
      id: "rec-1",
      kind: "dataset",
      title: "Title",
      creators: [{ name: "A" }],
      identifiers: { doi: "10.x/y" },
      source: {},
      distribution: {},
      record_path: "records/rec-1/record.json",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    });
  });

  it("defaults identifiers/source/distribution to empty objects", () => {
    const summary = recordSummary({ id: "rec-2" });
    assert.deepEqual(summary.identifiers, {});
    assert.deepEqual(summary.source, {});
    assert.deepEqual(summary.distribution, {});
  });
});

describe("upsertIndexRecord", () => {
  let dir;
  let cwd;

  beforeEach(() => {
    cwd = process.cwd();
    dir = makeTmpDir();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(cwd);
  });

  it("creates the index and inserts the first record", () => {
    const index = upsertIndexRecord({ id: "a", updated_at: "2024-01-01T00:00:00Z" });
    assert.equal(index.records.length, 1);
    assert.equal(index.records[0].id, "a");
    assert.ok(fs.existsSync(INDEX_PATH));
  });

  it("updates an existing record by id (merge) instead of duplicating", () => {
    upsertIndexRecord({ id: "a", title: "Old", updated_at: "2024-01-01T00:00:00Z" });
    const index = upsertIndexRecord({ id: "a", title: "New", updated_at: "2024-01-03T00:00:00Z" });
    assert.equal(index.records.length, 1);
    assert.equal(index.records[0].title, "New");
  });

  it("sorts records by updated_at descending", () => {
    upsertIndexRecord({ id: "a", updated_at: "2024-01-01T00:00:00Z" });
    const index = upsertIndexRecord({ id: "b", updated_at: "2024-06-01T00:00:00Z" });
    assert.deepEqual(index.records.map((r) => r.id), ["b", "a"]);
  });

  it("is a no-op (no rewrite) when the merged record is unchanged", () => {
    upsertIndexRecord({ id: "a", title: "Same", updated_at: "2024-01-01T00:00:00Z" });
    const before = fs.statSync(INDEX_PATH).mtimeMs;
    const index = upsertIndexRecord({ id: "a", title: "Same", updated_at: "2024-01-01T00:00:00Z" });
    const after = fs.statSync(INDEX_PATH).mtimeMs;
    assert.equal(before, after);
    assert.equal(index.records.length, 1);
  });
});
