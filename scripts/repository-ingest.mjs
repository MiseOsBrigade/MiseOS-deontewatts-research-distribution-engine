import fs from "node:fs";
import path from "node:path";
import { createRecordId, recordSummary, sha256, upsertIndexRecord, writeJson } from "./catalog-lib.mjs";

const repositoryUrl = process.env.REPOSITORY_URL;
const checkoutDir = process.env.REPOSITORY_CHECKOUT_DIR || "source-repository";
const archivePath = process.env.REPOSITORY_ARCHIVE_PATH || "uploads/repository-source.tar.gz";
if (!repositoryUrl) throw new Error("REPOSITORY_URL is required.");
if (!fs.existsSync(checkoutDir)) throw new Error(`${checkoutDir} does not exist.`);
if (!fs.existsSync(archivePath)) throw new Error(`${archivePath} does not exist.`);
const packageJson = fs.existsSync(path.join(checkoutDir, "package.json")) ? JSON.parse(fs.readFileSync(path.join(checkoutDir, "package.json"), "utf8")) : {};
const citation = fs.existsSync(path.join(checkoutDir, "CITATION.cff"));
const name = packageJson.name || path.basename(repositoryUrl.replace(/\.git$/, ""));
const title = process.env.RESEARCH_TITLE || name;
const description = process.env.RESEARCH_DESCRIPTION || packageJson.description || `Archived source release for ${repositoryUrl}.`;
const ref = process.env.REPOSITORY_REF || "HEAD";
const commit = process.env.REPOSITORY_COMMIT || "unknown";
const version = process.env.REPOSITORY_VERSION || packageJson.version || ref;
const now = new Date().toISOString();
const recordId = createRecordId(title, `${repositoryUrl}:${commit}`);
const targetDir = `records/${recordId}`;
const targetArchive = `${targetDir}/${path.basename(archivePath)}`;
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(archivePath, targetArchive);
const record = {
  id: recordId,
  kind: "software",
  title,
  description,
  creators: [{ name: process.env.CREATOR_NAME || "Watts, Deonte", orcid: process.env.ORCID_ID || "0009-0005-8586-3650" }],
  keywords: ["research software", "source archive"],
  license: process.env.REPOSITORY_LICENSE || "other-open",
  publication_date: now.slice(0, 10),
  version,
  access_right: "open",
  source: { type: "git-repository", repository_url: repositoryUrl, ref, commit, citation_cff_present: citation },
  files: [{ path: targetArchive, filename: path.basename(targetArchive), bytes: fs.statSync(targetArchive).size, sha256: sha256(targetArchive), media_type: "application/gzip" }],
  identifiers: {},
  distribution: { github: { status: "archived", repository_url: repositoryUrl, commit }, zenodo: { status: "queued" }, orcid: { status: "pending-analysis" }, software_heritage: { status: "recommended" } },
  created_at: now,
  updated_at: now
};
writeJson(`${targetDir}/record.json`, record);
writeJson(`${targetDir}/distribution.json`, record.distribution);
writeJson(`${targetDir}/manifest.json`, { record_id: recordId, files: record.files });
upsertIndexRecord(recordSummary(record));
writeJson("queue/current.json", { schema_version: "1.0.0", record_id: recordId, metadata_path: `${targetDir}/record.json`, files: [targetArchive], environment: "zenodo-sandbox", status: "queued", queued_at: now });
console.log(JSON.stringify({ record_id: recordId, targetArchive }, null, 2));
