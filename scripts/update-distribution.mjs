import { readJson, recordSummary, upsertIndexRecord, writeJson } from "./catalog-lib.mjs";

const resultPath = process.argv[2] || "dist/zenodo-result.json";
const queue = readJson("queue/current.json");
const result = readJson(resultPath);
if (!queue?.record_id) throw new Error("queue/current.json is missing record_id.");
if (!result) throw new Error(`${resultPath} is missing.`);

const recordPath = `records/${queue.record_id}/record.json`;
const record = readJson(recordPath);
if (!record) throw new Error(`${recordPath} is missing.`);

const now = new Date().toISOString();
const zenodo = {
  status: result.published ? "published" : result.deposition_id ? "draft" : "failed",
  environment: result.environment || queue.environment || "zenodo-sandbox",
  deposition_id: result.deposition_id || null,
  doi: result.doi || result.reserved_doi || null,
  url: result.record_url || result.html_url || null,
  published: Boolean(result.published),
  updated_at: now
};
record.distribution = { ...(record.distribution || {}), zenodo };
record.identifiers = { ...(record.identifiers || {}), ...(zenodo.doi ? { doi: zenodo.doi } : {}) };
record.updated_at = now;
writeJson(recordPath, record);
writeJson(`records/${queue.record_id}/distribution.json`, record.distribution);
upsertIndexRecord(recordSummary(record));
writeJson("queue/current.json", { ...queue, status: zenodo.status, processed_at: now, result_path: resultPath });
console.log(JSON.stringify({ record_id: record.id, zenodo }, null, 2));
