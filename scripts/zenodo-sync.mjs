import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const token = process.env.ZENODO_ACCESS_TOKEN;
const base = process.env.ZENODO_BASE_URL || "https://sandbox.zenodo.org/api";
const publish = process.env.PUBLISH_ZENODO === "true";
const uploadRoot = process.env.RESEARCH_UPLOAD_DIR || "uploads";

if (!token) {
  throw new Error("ZENODO_ACCESS_TOKEN is required.");
}

const source = JSON.parse(fs.readFileSync("metadata/research.json", "utf8"));
const jsonHeaders = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json"
};
const authHeaders = { Authorization: `Bearer ${token}` };

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (entry.name === "README.md" || entry.name === ".gitkeep") return [];
    return [fullPath];
  });
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...jsonHeaders, ...(options.headers || {}) }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return body ? JSON.parse(body) : {};
}

const files = collectFiles(uploadRoot);
if (files.length === 0) {
  throw new Error(`No research files found in ${uploadRoot}/.`);
}

const deposit = await requestJson(`${base}/deposit/depositions`, {
  method: "POST",
  body: "{}"
});

const metadata = {
  metadata: {
    title: source.title,
    upload_type: source.upload_type,
    publication_type: source.publication_type,
    publication_date: source.publication_date,
    description: source.description,
    creators: source.creators,
    keywords: source.keywords || [],
    access_right: source.access_right,
    license: source.license,
    related_identifiers: source.related_identifiers || [],
    prereserve_doi: true
  }
};

const updated = await requestJson(`${base}/deposit/depositions/${deposit.id}`, {
  method: "PUT",
  body: JSON.stringify(metadata)
});

const bucketUrl = updated.links?.bucket || deposit.links?.bucket;
if (!bucketUrl) {
  throw new Error("Zenodo did not return an upload bucket URL.");
}

const uploadedFiles = [];
for (const filePath of files) {
  const filename = path.basename(filePath);
  const target = `${bucketUrl}/${encodeURIComponent(filename)}`;
  const response = await fetch(target, {
    method: "PUT",
    headers: authHeaders,
    body: fs.readFileSync(filePath)
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`File upload failed for ${filename}: ${response.status} ${body}`);
  }
  const remote = body ? JSON.parse(body) : {};
  uploadedFiles.push({
    local_path: filePath,
    filename,
    size: fs.statSync(filePath).size,
    sha256: sha256(filePath),
    zenodo_checksum: remote.checksum || null
  });
}

const result = {
  deposition_id: updated.id,
  reserved_doi: updated.metadata?.prereserve_doi?.doi ?? null,
  html_url: updated.links?.html ?? null,
  state: updated.state,
  files: uploadedFiles,
  published: false
};

if (publish) {
  const published = await requestJson(
    `${base}/deposit/depositions/${deposit.id}/actions/publish`,
    { method: "POST", headers: authHeaders }
  );
  result.published = true;
  result.doi = published.doi ?? null;
  result.record_url = published.record_url ?? null;
}

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/zenodo-result.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
