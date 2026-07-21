import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { metadataFingerprint, persistRecord, readJson, recordPaths, sha256, sha256Content, zenodoMetadata } from "./catalog-lib.mjs";

test("recordPaths builds the catalog paths for a record", () => {
  assert.deepEqual(recordPaths("example-record"), {
    directory: "records/example-record",
    record: "records/example-record/record.json",
    manifest: "records/example-record/manifest.json",
    distribution: "records/example-record/distribution.json"
  });
});

test("sha256 hashes buffers and files consistently", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-lib-"));
  const filePath = path.join(directory, "payload.bin");
  const content = Buffer.from("research payload");

  try {
    fs.writeFileSync(filePath, content);
    assert.equal(sha256(filePath), sha256Content(content));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("zenodoMetadata applies the shared deposit defaults", () => {
  assert.deepEqual(
    zenodoMetadata({
      kind: "publication",
      title: "Example",
      description: "Example record",
      creators: [{ name: "Researcher, Example" }],
      publication_date: "2026-07-14"
    }),
    {
      title: "Example",
      upload_type: "publication",
      publication_type: "technicalnote",
      publication_date: "2026-07-14",
      description: "Example record",
      creators: [{ name: "Researcher, Example" }],
      keywords: [],
      access_right: "open",
      license: "cc-by-4.0",
      related_identifiers: []
    }
  );
});

test("metadataFingerprint hashes the normalized Zenodo metadata", () => {
  const record = {
    kind: "software",
    title: "Example",
    description: "Example record",
    creators: [{ name: "Researcher, Example" }],
    publication_date: "2026-07-14",
    version: "1.2.3"
  };
  const canonicalSha256 = "abc123";

  assert.equal(
    metadataFingerprint(record, canonicalSha256),
    sha256Content(JSON.stringify({ ...zenodoMetadata(record), canonical_sha256: canonicalSha256 }))
  );
});

test("persistRecord writes record state and refreshes the index", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-record-"));
  const previousDirectory = process.cwd();
  const paths = recordPaths("example-record");
  const record = {
    id: "example-record",
    kind: "dataset",
    title: "Example",
    creators: [{ name: "Researcher, Example" }],
    distribution: { zenodo: { status: "queued" } },
    created_at: "2026-07-14T00:00:00.000Z",
    updated_at: "2026-07-14T00:00:00.000Z"
  };
  const distribution = { record_id: record.id, zenodo: record.distribution.zenodo };

  try {
    process.chdir(directory);
    persistRecord(paths.record, record, paths.distribution, distribution);

    assert.deepEqual(readJson(paths.record), record);
    assert.deepEqual(readJson(paths.distribution), distribution);
    assert.equal(readJson("data/research-index.json").records[0].id, record.id);
  } finally {
    process.chdir(previousDirectory);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
