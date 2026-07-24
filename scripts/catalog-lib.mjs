import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const INDEX_PATH = "data/research-index.json";

export function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

export function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "record";
}

export function createRecordId(title, seed = "") {
  const digest = crypto.createHash("sha256").update(`${title}\n${seed}`).digest("hex").slice(0, 10);
  return `${new Date().toISOString().slice(0, 10)}-${slugify(title)}-${digest}`;
}

export function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// Captures exactly the fields a Zenodo deposit is actually built from (see zenodo-sync.mjs's
// metadata block) plus the canonical file's checksum, so a production publish can require this
// to still match what a Sandbox draft was reviewed against - editing the record or swapping the
// canonical file after the Sandbox sync completed changes the fingerprint and blocks publish
// until a fresh Sandbox draft is produced and reviewed.
export function metadataFingerprint(record, canonicalSha256) {
  const relevant = {
    title: record.title,
    description: record.description,
    creators: record.creators,
    keywords: record.keywords || [],
    license: record.license,
    upload_type: record.upload_type,
    publication_type: record.publication_type,
    publication_date: record.publication_date,
    access_right: record.access_right,
    related_identifiers: record.related_identifiers || [],
    canonical_sha256: canonicalSha256
  };
  return crypto.createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
}

export function upsertIndexRecord(summary) {
  const index = readJson(INDEX_PATH, { schema_version: "1.0.0", updated_at: new Date().toISOString(), records: [] });
  const position = index.records.findIndex((record) => record.id === summary.id);
  const merged = position >= 0 ? { ...index.records[position], ...summary } : summary;
  const unchanged = position >= 0 && JSON.stringify(index.records[position]) === JSON.stringify(merged);
  if (unchanged) return index;

  if (position >= 0) index.records[position] = merged;
  else index.records.push(merged);
  index.records.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  index.updated_at = new Date().toISOString();
  writeJson(INDEX_PATH, index);
  return index;
}

export function recordSummary(record) {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    creators: record.creators,
    identifiers: record.identifiers || {},
    source: record.source || {},
    distribution: record.distribution || {},
    record_path: `records/${record.id}/record.json`,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}
