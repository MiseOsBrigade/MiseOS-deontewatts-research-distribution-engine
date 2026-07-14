import fs from "node:fs";
import { readJson, recordSummary, sha256, upsertIndexRecord, writeJson } from "./catalog-lib.mjs";

const PENDING_PATH = "queue/pending.json";
const CURRENT_PATH = "queue/current.json";

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) fs.appendFileSync(file, `${name}=${value}\n`);
}

function notReady(message) {
  console.log(message);
  setOutput("ready", "false");
}

const existingCurrent = readJson(CURRENT_PATH);
if (existingCurrent && !existingCurrent.processed_at) {
  console.log(`queue/current.json already has an unprocessed record queued: ${existingCurrent.record_id}`);
  setOutput("ready", "true");
  process.exit(0);
}

const pending = readJson(PENDING_PATH);
if (!pending) throw new Error(`${PENDING_PATH} is missing.`);

const maxActive = pending.rules?.max_active_records ?? 1;
const activeCount = (pending.records || []).filter((entry) => entry.status === "queued_for_sync").length;
if (activeCount >= maxActive) {
  notReady(`Max active records (${maxActive}) already queued for sync; waiting for that run to finish.`);
  process.exit(0);
}

const sorted = [...(pending.records || [])].sort((a, b) => a.position - b.position);
let promoted = null;

for (const entry of sorted) {
  if (entry.status !== "blocked_pending_binary_attachment" && entry.status !== "ready_for_sync") continue;

  const recordPath = `records/${entry.record_id}/record.json`;
  const manifestPath = `records/${entry.record_id}/manifest.json`;
  const distributionPath = `records/${entry.record_id}/distribution.json`;
  if (![recordPath, manifestPath, distributionPath].every((filePath) => fs.existsSync(filePath))) continue;

  const manifest = readJson(manifestPath);
  const canonical = (manifest.files || []).find((file) => file.role === "canonical");
  if (!canonical || !fs.existsSync(canonical.path)) continue;

  const actualHash = sha256(canonical.path);
  if (actualHash !== canonical.sha256) {
    throw new Error(`Checksum mismatch for ${canonical.path}: expected ${canonical.sha256}, got ${actualHash}`);
  }

  promoted = { entry, recordPath, manifestPath, distributionPath, canonical };
  break;
}

if (!promoted) {
  notReady("No pending record has its canonical file attached yet; nothing to promote.");
  process.exit(0);
}

const { entry, recordPath, manifestPath, distributionPath, canonical } = promoted;
const now = new Date().toISOString();

// Write pending.json and record.json first, and queue/current.json last: current.json's
// existence is what the next run treats as "a promotion already happened", so it must only
// appear once every other piece of that promotion's state is durable.
entry.status = "queued_for_sync";
pending.current_record_id = entry.record_id;
writeJson(PENDING_PATH, pending);

const record = readJson(recordPath);
record.updated_at = now;
writeJson(recordPath, record);
upsertIndexRecord(recordSummary(record));

writeJson(CURRENT_PATH, {
  schema_version: "1.0.0",
  record_id: entry.record_id,
  metadata_path: recordPath,
  manifest_path: manifestPath,
  distribution_path: distributionPath,
  files: [canonical.path],
  environment: pending.environment || "zenodo-sandbox",
  publish: false,
  status: "queued",
  queued_at: now
});

console.log(`Promoted ${entry.record_id} to queue/current.json.`);
setOutput("ready", "true");
