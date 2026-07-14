import crypto from "node:crypto";
import fs from "node:fs";

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse JSON from ${filePath}: ${error.message}`);
  }
}

const queue = readJson("queue/current.json");
if (!queue.record_id || !queue.metadata_path || !queue.manifest_path || !queue.distribution_path) {
  throw new Error("queue/current.json is missing required record paths.");
}
if (!Array.isArray(queue.files) || queue.files.length !== 1) {
  throw new Error("Exactly one canonical file must be queued per Research Sync run.");
}
if (queue.publish === true) {
  throw new Error("Automatic pushes may not request permanent publication.");
}

for (const filePath of [queue.metadata_path, queue.manifest_path, queue.distribution_path, ...queue.files]) {
  if (!fs.existsSync(filePath)) throw new Error(`Queued path is missing: ${filePath}`);
}

const record = readJson(queue.metadata_path);
const manifest = readJson(queue.manifest_path);
if (record.id !== queue.record_id || manifest.record_id !== queue.record_id) {
  throw new Error("Queue, record, and manifest IDs do not match.");
}

for (const filePath of queue.files) {
  const expected = (manifest.files || []).find((entry) => entry.path === filePath);
  if (!expected?.sha256) throw new Error(`Manifest checksum is missing for ${filePath}`);
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (actual !== expected.sha256) throw new Error(`Checksum mismatch for ${filePath}`);
}

console.log(JSON.stringify({ record_id: queue.record_id, files: queue.files, valid: true }, null, 2));
