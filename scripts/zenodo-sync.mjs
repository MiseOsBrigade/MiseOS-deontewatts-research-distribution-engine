import fs from "node:fs";

const token = process.env.ZENODO_ACCESS_TOKEN;
const base = process.env.ZENODO_BASE_URL || "https://sandbox.zenodo.org/api";
const publish = process.env.PUBLISH_ZENODO === "true";

if (!token) {
  throw new Error("ZENODO_ACCESS_TOKEN is required.");
}

const source = JSON.parse(fs.readFileSync("metadata/research.json", "utf8"));
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json"
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return body ? JSON.parse(body) : {};
}

const deposit = await request(`${base}/deposit/depositions`, {
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

const updated = await request(`${base}/deposit/depositions/${deposit.id}`, {
  method: "PUT",
  body: JSON.stringify(metadata)
});

const result = {
  deposition_id: updated.id,
  reserved_doi: updated.metadata?.prereserve_doi?.doi ?? null,
  html_url: updated.links?.html ?? null,
  state: updated.state,
  published: false
};

if (publish) {
  const published = await request(
    `${base}/deposit/depositions/${deposit.id}/actions/publish`,
    { method: "POST" }
  );
  result.published = true;
  result.doi = published.doi ?? null;
  result.record_url = published.record_url ?? null;
}

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/zenodo-result.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
