import { persistRecord, readJson, recordPaths } from "./catalog-lib.mjs";

if (process.env.ORCID_WRITE_ENABLED !== "true") {
  console.log("ORCID write-back is disabled. Set ORCID_WRITE_ENABLED=true only after Member API authorization.");
  process.exit(0);
}
const token = process.env.ORCID_ACCESS_TOKEN;
const orcid = process.env.ORCID_ID;
const base = (process.env.ORCID_MEMBER_API_BASE || "https://api.orcid.org/v3.0").replace(/\/$/, "");
if (!token || !orcid) throw new Error("ORCID_ACCESS_TOKEN and ORCID_ID are required.");
const index = readJson("data/research-index.json", { records: [] });
for (const summary of index.records || []) {
  const record = readJson(summary.record_path);
  if (!record || record.distribution?.orcid?.status !== "recommended" || !record.identifiers?.doi) continue;
  const [year, month, day] = String(record.publication_date || new Date().toISOString().slice(0, 10)).split("-");
  const payload = {
    title: { title: { value: record.title } },
    type: record.kind === "software" ? "software" : "other",
    "publication-date": { year: { value: year }, month: { value: month }, day: { value: day } },
    "external-ids": { "external-id": [{ "external-id-type": "doi", "external-id-value": record.identifiers.doi, "external-id-relationship": "self" }] },
    url: { value: record.distribution?.zenodo?.url || `https://doi.org/${record.identifiers.doi}` }
  };
  const response = await fetch(`${base}/${orcid}/work`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.orcid+json", Accept: "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`ORCID write failed for ${record.id}: ${response.status} ${await response.text()}`);
  record.distribution.orcid = { status: "present", added_by: "research-distribution-engine", location: response.headers.get("location"), updated_at: new Date().toISOString() };
  record.updated_at = new Date().toISOString();
  persistRecord(summary.record_path, record, recordPaths(record.id).distribution);
}
