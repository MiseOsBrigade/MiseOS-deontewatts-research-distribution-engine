import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { recordSummary, upsertIndexRecord, writeJson } from "./catalog-lib.mjs";

const RECORD_ID = "zenodo-sandbox-validation";
const uploadDirectory = "uploads";
const outputPath = path.join(uploadDirectory, "zenodo-sandbox-validation.bin");
const metadataPath = "metadata/research.json";
const recordDirectory = `records/${RECORD_ID}`;

fs.mkdirSync(uploadDirectory, { recursive: true });

const header = Buffer.from("MISEOS-ZENODO-SANDBOX-VALIDATION\0", "utf8");
const payload = Buffer.alloc(2048);
for (let index = 0; index < payload.length; index += 1) {
  payload[index] = (index * 31 + 17) % 256;
}

const binary = Buffer.concat([header, payload]);
fs.writeFileSync(outputPath, binary);
const fileSha256 = crypto.createHash("sha256").update(binary).digest("hex");

const existing = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const now = new Date().toISOString();
const publicationDate = now.slice(0, 10);
const metadata = {
  ...existing,
  title: "MiseOS Research Distribution Engine — Zenodo Sandbox Validation",
  creators: [
    {
      name: "Watts, Deonte",
      orcid: "0009-0005-8586-3650"
    }
  ],
  description:
    "Deterministic binary validation deposit used to verify the GitHub-to-Zenodo Sandbox research distribution workflow, metadata mapping, byte-preserving upload, checksum reporting, and draft-only publication controls.",
  keywords: [
    "MiseOS",
    "research automation",
    "Zenodo Sandbox",
    "workflow validation",
    "checksum verification"
  ],
  license: "cc-by-4.0",
  upload_type: "publication",
  publication_type: "technicalnote",
  publication_date: publicationDate,
  access_right: "open",
  related_identifiers: []
};

fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

const record = {
  id: RECORD_ID,
  kind: "publication",
  title: metadata.title,
  description: metadata.description,
  creators: metadata.creators,
  keywords: metadata.keywords,
  license: metadata.license,
  upload_type: metadata.upload_type,
  publication_type: metadata.publication_type,
  publication_date: metadata.publication_date,
  access_right: metadata.access_right,
  related_identifiers: metadata.related_identifiers,
  files: [
    {
      role: "canonical",
      name: path.basename(outputPath),
      path: outputPath,
      sha256: fileSha256,
      size: binary.length
    }
  ],
  source: { type: "ci-validation" },
  identifiers: {},
  distribution: {},
  created_at: now,
  updated_at: now
};

writeJson(`${recordDirectory}/record.json`, record);
writeJson(`${recordDirectory}/manifest.json`, {
  record_id: RECORD_ID,
  state: "draft",
  files: record.files,
  validated: false
});
writeJson(`${recordDirectory}/distribution.json`, {
  record_id: RECORD_ID,
  publication_enabled: false,
  zenodo: { status: "queued", environment: "zenodo-sandbox" },
  orcid: { status: "blocked-until-reserved-doi", write_back_enabled: false, approval_required: true },
  updated_at: now
});
upsertIndexRecord(recordSummary(record));

writeJson("queue/current.json", {
  schema_version: "1.0.0",
  record_id: RECORD_ID,
  metadata_path: `${recordDirectory}/record.json`,
  manifest_path: `${recordDirectory}/manifest.json`,
  distribution_path: `${recordDirectory}/distribution.json`,
  files: [outputPath],
  environment: "zenodo-sandbox",
  publish: false,
  status: "queued",
  queued_at: now
});

console.log(
  JSON.stringify(
    {
      output: outputPath,
      bytes: binary.length,
      sha256: fileSha256,
      metadata: metadataPath,
      record: `${recordDirectory}/record.json`,
      queue: "queue/current.json",
      publication_date: publicationDate
    },
    null,
    2
  )
);
