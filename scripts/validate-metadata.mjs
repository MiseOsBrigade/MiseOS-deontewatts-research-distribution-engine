import fs from "node:fs";

// Validate whichever record is actually staged for sync (queue/current.json.metadata_path),
// so a real backlog record's records/<id>/record.json gets the same required-field check as
// the sandbox-validation payload, instead of only ever checking metadata/research.json - a
// file that's unrelated to the record actually being synced once a real backlog item is
// promoted. Fall back to metadata/research.json for standalone use before anything is queued.
const queue = fs.existsSync("queue/current.json") ? JSON.parse(fs.readFileSync("queue/current.json", "utf8")) : null;
const path = queue?.metadata_path || "metadata/research.json";
const required = [
  "title",
  "creators",
  "description",
  "license",
  "upload_type",
  "publication_date",
  "access_right"
];

if (!fs.existsSync(path)) {
  console.error(`Missing ${path}`);
  process.exit(1);
}

const metadata = JSON.parse(fs.readFileSync(path, "utf8"));
const missing = required.filter((field) => {
  const value = metadata[field];
  return value === undefined || value === null || value === "";
});

if (!Array.isArray(metadata.creators) || metadata.creators.length === 0) {
  missing.push("creators[0]");
}

if (missing.length > 0) {
  console.error(`Missing required metadata: ${missing.join(", ")}`);
  process.exit(1);
}

for (const creator of metadata.creators) {
  if (!creator.name) {
    console.error("Each creator must include a name.");
    process.exit(1);
  }
}

console.log("Research metadata is valid.");
