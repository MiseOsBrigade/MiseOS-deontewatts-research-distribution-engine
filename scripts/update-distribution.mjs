import { readJson, recordSummary, upsertIndexRecord, writeJson } from "./catalog-lib.mjs";

const resultPath = process.argv[2] || "dist/zenodo-result.json";
const queue = readJson("queue/current.json");
const result = readJson(resultPath);
if (!queue?.record_id) throw new Error("queue/current.json is missing record_id.");
if (!result) throw new Error(`${resultPath} is missing.`);

const recordPath = queue.metadata_path || `records/${queue.record_id}/record.json`;
const distributionPath = queue.distribution_path || `records/${queue.record_id}/distribution.json`;
const record = readJson(recordPath);
if (!record) throw new Error(`${recordPath} is missing.`);

const now = new Date().toISOString();
const zenodo = {
  status: result.published ? "published" : result.deposition_id ? "draft" : "failed",
  environment: result.environment || queue.environment || "zenodo-sandbox",
  deposition_id: result.deposition_id || null,
  reserved_doi: result.reserved_doi || null,
  doi: result.published ? (result.doi || result.reserved_doi || null) : null,
  url: result.record_url || result.html_url || null,
  published: Boolean(result.published),
  updated_at: now,
};

record.distribution = { ...(record.distribution || {}), zenodo };
record.identifiers = {
  ...(record.identifiers || {}),
  reserved_doi: zenodo.reserved_doi,
  ...(zenodo.doi ? { doi: zenodo.doi } : {}),
};
record.status = zenodo.status === "failed" ? "sync-failed" : zenodo.published ? "published" : "zenodo-draft";
record.updated_at = now;

writeJson(recordPath, record);
writeJson(distributionPath, {
  record_id: record.id,
  publication_enabled: Boolean(zenodo.published),
  zenodo,
  orcid: record.distribution?.orcid || { status: "blocked-until-reserved-doi", write_back_enabled: false, approval_required: true },
  updated_at: now,
});
upsertIndexRecord(recordSummary(record));
writeJson("queue/current.json", {
  ...queue,
  status: zenodo.status,
  processed_at: now,
  result_path: resultPath,
  reserved_doi: zenodo.reserved_doi,
  published: zenodo.published,
});

const pending = readJson("queue/pending.json");
if (pending) {
  const entry = (pending.records || []).find((item) => item.record_id === queue.record_id);
  if (entry) entry.status = zenodo.status === "failed" ? "sync-failed" : zenodo.published ? "published" : "synced-draft";
  if (pending.current_record_id === queue.record_id) pending.current_record_id = null;
  writeJson("queue/pending.json", pending);
}

console.log(JSON.stringify({ record_id: record.id, zenodo }, null, 2));
