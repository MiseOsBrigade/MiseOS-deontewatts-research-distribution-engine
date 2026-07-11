import fs from "node:fs";

const path = "metadata/research.json";
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
