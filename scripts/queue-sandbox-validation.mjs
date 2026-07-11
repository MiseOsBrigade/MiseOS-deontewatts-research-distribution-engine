import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const uploadDirectory = "uploads";
const outputPath = path.join(uploadDirectory, "zenodo-sandbox-validation.bin");
const metadataPath = "metadata/research.json";

fs.mkdirSync(uploadDirectory, { recursive: true });

const header = Buffer.from("MISEOS-ZENODO-SANDBOX-VALIDATION\0", "utf8");
const payload = Buffer.alloc(2048);
for (let index = 0; index < payload.length; index += 1) {
  payload[index] = (index * 31 + 17) % 256;
}

const binary = Buffer.concat([header, payload]);
fs.writeFileSync(outputPath, binary);

const existing = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const publicationDate = new Date().toISOString().slice(0, 10);
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

const sha256 = crypto.createHash("sha256").update(binary).digest("hex");
console.log(
  JSON.stringify(
    {
      output: outputPath,
      bytes: binary.length,
      sha256,
      metadata: metadataPath,
      publication_date: publicationDate
    },
    null,
    2
  )
);
