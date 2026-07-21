import fs from "node:fs";
import path from "node:path";
import { readJson, sha256, writeJson, zenodoMetadata } from "./catalog-lib.mjs";

const token = process.env.ZENODO_ACCESS_TOKEN;
const base = process.env.ZENODO_BASE_URL || "https://sandbox.zenodo.org/api";
const publish = process.env.PUBLISH_ZENODO === "true";
if (!token) throw new Error("ZENODO_ACCESS_TOKEN is required.");

const queue = readJson("queue/current.json");
if (!queue.record_id || !queue.metadata_path || !Array.isArray(queue.files) || queue.files.length === 0) throw new Error("queue/current.json is invalid.");
const record = readJson(queue.metadata_path);
const files = queue.files.filter((filePath) => fs.existsSync(filePath));
if (files.length !== queue.files.length) throw new Error("One or more queued files are missing.");

const jsonHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const authHeaders = { Authorization: `Bearer ${token}` };
async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...jsonHeaders, ...(options.headers || {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${body}`);
  return body ? JSON.parse(body) : {};
}
const deposit = await requestJson(`${base}/deposit/depositions`, { method: "POST", body: "{}" });
const metadata = {
  metadata: { ...zenodoMetadata(record), prereserve_doi: true }
};
const updated = await requestJson(`${base}/deposit/depositions/${deposit.id}`, { method: "PUT", body: JSON.stringify(metadata) });
const bucketUrl = updated.links?.bucket || deposit.links?.bucket;
if (!bucketUrl) throw new Error("Zenodo did not return an upload bucket URL.");
const uploadedFiles = [];
for (const filePath of files) {
  const filename = path.basename(filePath);
  const response = await fetch(`${bucketUrl}/${encodeURIComponent(filename)}`, { method: "PUT", headers: authHeaders, body: fs.readFileSync(filePath) });
  const body = await response.text();
  if (!response.ok) throw new Error(`File upload failed for ${filename}: ${response.status} ${body}`);
  const remote = body ? JSON.parse(body) : {};
  uploadedFiles.push({ local_path: filePath, filename, size: fs.statSync(filePath).size, sha256: sha256(filePath), zenodo_checksum: remote.checksum || null });
}
const result = { record_id: record.id, environment: base.includes("sandbox") ? "zenodo-sandbox" : "zenodo-production", deposition_id: updated.id, reserved_doi: updated.metadata?.prereserve_doi?.doi ?? null, html_url: updated.links?.html ?? null, state: updated.state, files: uploadedFiles, published: false };
if (publish) {
  const published = await requestJson(`${base}/deposit/depositions/${deposit.id}/actions/publish`, { method: "POST", headers: authHeaders });
  result.published = true;
  result.doi = published.doi ?? published.metadata?.doi ?? null;
  result.record_url = published.record_url ?? published.links?.html ?? null;
}
writeJson("dist/zenodo-result.json", result);
console.log(JSON.stringify(result, null, 2));
