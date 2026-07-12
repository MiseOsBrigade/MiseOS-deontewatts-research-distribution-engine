import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const token = process.env.ZENODO_ACCESS_TOKEN;
const base = process.env.ZENODO_BASE_URL || "https://sandbox.zenodo.org/api";
const publish = process.env.PUBLISH_ZENODO === "true";
if (!token) throw new Error("ZENODO_ACCESS_TOKEN is required.");

const queue = JSON.parse(fs.readFileSync("queue/current.json", "utf8"));
if (!queue.record_id || !queue.metadata_path || !Array.isArray(queue.files) || queue.files.length === 0) throw new Error("queue/current.json is invalid.");
const record = JSON.parse(fs.readFileSync(queue.metadata_path, "utf8"));
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
function sha256(filePath) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }

const deposit = await requestJson(`${base}/deposit/depositions`, { method: "POST", body: "{}" });
const metadata = {
  metadata: {
    title: record.title,
    upload_type: record.kind === "software" ? "software" : record.kind === "dataset" ? "dataset" : (record.upload_type || "publication"),
    ...(record.kind === "publication" ? { publication_type: record.publication_type || "technicalnote" } : {}),
    publication_date: record.publication_date,
    description: record.description,
    creators: record.creators,
    keywords: record.keywords || [],
    access_right: record.access_right || "open",
    license: record.license || "cc-by-4.0",
    version: record.version || undefined,
    related_identifiers: record.related_identifiers || [],
    prereserve_doi: true
  }
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
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/zenodo-result.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
