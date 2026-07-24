import fs from "node:fs";
import { readJson, recordSummary, upsertIndexRecord, writeJson } from "./catalog-lib.mjs";

const orcid = process.env.ORCID_ID || "0009-0005-8586-3650";
const base = (process.env.ORCID_API_BASE || "https://pub.orcid.org/v3.0").replace(/\/$/, "");
const queue = readJson("queue/current.json", {});
const requestedRecordId = process.env.ORCID_RECORD_ID || queue.record_id || null;

const response = await fetch(`${base}/${orcid}/works`, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`ORCID ${response.status}: ${await response.text()}`);
const works = await response.json();
const normalize = (value = "") => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normalizeDoi = (value = "") => value.toLowerCase().replace(/^https?:\/\/doi.org\//, "").trim();
const publicWorks = (works.group || []).map((group) => {
  const summary = group["work-summary"]?.[0] || {};
  const externalIds = summary["external-ids"]?.["external-id"] || [];
  return {
    put_code: summary["put-code"],
    title: summary.title?.title?.value || "",
    type: summary.type || null,
    url: summary.url?.value || null,
    external_ids: externalIds.map((entry) => ({ type: entry["external-id-type"], value: entry["external-id-value"] })),
  };
});

const index = readJson("data/research-index.json", { records: [] });
const summaries = (index.records || []).filter((summary) => !requestedRecordId || summary.id === requestedRecordId);
const report = { orcid, analyzed_at: new Date().toISOString(), public_work_count: publicWorks.length, records: [] };

for (const summary of summaries) {
  const record = readJson(summary.record_path);
  if (!record) continue;

  const identifier = normalizeDoi(record.identifiers?.doi || record.identifiers?.reserved_doi || "");
  if (!identifier) {
    report.records.push({ id: record.id, title: record.title, status: "blocked-no-doi", matched_put_code: null });
    continue;
  }

  const exactDoi = publicWorks.find((work) => work.external_ids.some((id) => id.type === "doi" && normalizeDoi(id.value) === identifier));
  const titleMatch = publicWorks.find((work) => normalize(work.title) === normalize(record.title));
  const match = exactDoi || titleMatch || null;
  const status = match ? "present" : "recommended";
  const orcidState = {
    status,
    matched_put_code: match?.put_code || null,
    match_method: exactDoi ? "doi" : titleMatch ? "title" : null,
    analyzed_at: report.analyzed_at,
    identifier_checked: identifier,
    write_back_enabled: false,
    approval_required: true,
  };

  record.distribution = { ...(record.distribution || {}), orcid: orcidState };
  record.updated_at = report.analyzed_at;
  writeJson(summary.record_path, record);
  writeJson(`records/${record.id}/distribution.json`, {
    record_id: record.id,
    publication_enabled: Boolean(record.distribution?.zenodo?.published),
    zenodo: record.distribution?.zenodo || {},
    orcid: orcidState,
    updated_at: report.analyzed_at,
  });
  upsertIndexRecord(recordSummary(record));
  report.records.push({ id: record.id, title: record.title, status, matched_put_code: match?.put_code || null });
}

fs.mkdirSync("reports", { recursive: true });
writeJson("reports/orcid-analysis.json", report);
console.log(JSON.stringify(report, null, 2));
