import fs from "node:fs";
import { metadataFingerprint, persistRecord, readJson, recordPaths, sha256, writeJson } from "./catalog-lib.mjs";

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

function verifyCanonicalFile(entry) {
  const { record: recordPath, manifest: manifestPath, distribution: distributionPath } = recordPaths(entry.record_id);
  if (![recordPath, manifestPath, distributionPath].every((filePath) => fs.existsSync(filePath))) return null;

  const manifest = readJson(manifestPath);
  const canonical = (manifest.files || []).find((file) => file.role === "canonical");
  if (!canonical || !fs.existsSync(canonical.path)) return null;

  const actualHash = sha256(canonical.path);
  if (actualHash !== canonical.sha256) {
    throw new Error(`Checksum mismatch for ${canonical.path}: expected ${canonical.sha256}, got ${actualHash}`);
  }

  return { entry, recordPath, manifestPath, distributionPath, canonical };
}

// Only the canonical file is ever uploaded (see CURRENT_PATH.files below), but the manifest can
// list supplemental/source/metadata entries too. Mark the manifest validated only once every
// entry that's actually present on disk checksums correctly - a manifest with unattached
// supplemental files is not fully validated just because its canonical file verified.
function verifyManifestFiles(manifest) {
  let allPresent = true;
  for (const file of manifest.files || []) {
    if (!fs.existsSync(file.path)) {
      allPresent = false;
      continue;
    }
    const actualHash = sha256(file.path);
    if (actualHash !== file.sha256) {
      throw new Error(`Checksum mismatch for ${file.path}: expected ${file.sha256}, got ${actualHash}`);
    }
  }
  return allPresent;
}

function buildCurrentState({ recordId, recordPath, manifestPath, distributionPath, canonicalPath, environment, queuedAt }) {
  return {
    schema_version: "1.0.0",
    record_id: recordId,
    metadata_path: recordPath,
    manifest_path: manifestPath,
    distribution_path: distributionPath,
    files: [canonicalPath],
    environment,
    publish: false,
    status: "queued",
    queued_at: queuedAt
  };
}

function writePromotion(promotion, pending) {
  const { entry, recordPath, manifestPath, distributionPath, canonical } = promotion;
  const now = new Date().toISOString();

  // Write pending.json and record.json first, and queue/current.json last: current.json's
  // existence is what the next run treats as "a promotion already happened", so it must only
  // appear once every other piece of that promotion's state is durable.
  entry.status = "queued_for_sync";
  pending.current_record_id = entry.record_id;
  writeJson(PENDING_PATH, pending);

  const record = readJson(recordPath);
  record.updated_at = now;
  persistRecord(recordPath, record);

  // require_manifest_validation is satisfied per-file, not just for the canonical entry that
  // verifyCanonicalFile already checked - persist that back so the manifest accurately reflects
  // whether every listed file has actually been attached and checksum-verified. When the rule is
  // on, an incomplete manifest must block promotion rather than just being recorded as such.
  const manifest = readJson(manifestPath);
  manifest.validated = verifyManifestFiles(manifest);
  writeJson(manifestPath, manifest);
  if (pending.rules?.require_manifest_validation && !manifest.validated) {
    throw new Error(`Manifest validation is required for ${entry.record_id}, but one or more listed files are missing or unverified.`);
  }

  writeJson(
    CURRENT_PATH,
    buildCurrentState({
      recordId: entry.record_id,
      recordPath,
      manifestPath,
      distributionPath,
      canonicalPath: canonical.path,
      environment: pending.environment || "zenodo-sandbox",
      queuedAt: now
    })
  );
}

// Stage a specific already-synced record for production publish, independent of whatever
// queue/current.json currently holds. Automatic backlog continuation (see below) advances
// queue/current.json to the next pending record as soon as a Sandbox sync finishes, which can
// happen before a human gets to review the record that was just synced and dispatch its
// production publish. Re-deriving the target from record_id instead of trusting
// queue/current.json means that race can no longer strand or swap the record being published.
function stageForManualPublish(recordId) {
  const pending = readJson(PENDING_PATH);
  const existingCurrent = readJson(CURRENT_PATH);

  // Publishing record A must not clobber a *different* record B that the automatic backlog
  // still has actively in flight: overwriting queue/current.json here would discard B's queue
  // state while pending.json still marks B as queued_for_sync, and neither the write-back
  // reconciliation nor the interrupted-promotion recovery below know how to resume a record
  // that queue/current.json no longer references. Refuse until B's sync finishes.
  if (existingCurrent && !existingCurrent.processed_at && existingCurrent.record_id !== recordId) {
    throw new Error(
      `Cannot stage ${recordId} for production publish: ${existingCurrent.record_id} is still an unprocessed sync in queue/current.json. Wait for it to finish first.`
    );
  }
  if (pending?.current_record_id && pending.current_record_id !== recordId) {
    const activeEntry = (pending.records || []).find((item) => item.record_id === pending.current_record_id);
    if (activeEntry?.status === "queued_for_sync") {
      throw new Error(
        `Cannot stage ${recordId} for production publish: ${pending.current_record_id} is still queued_for_sync in the backlog. Wait for that sync to finish first.`
      );
    }
  }

  const staged = verifyCanonicalFile({ record_id: recordId });
  if (!staged) {
    throw new Error(
      `${recordId} is missing its record/manifest/distribution files, or its canonical file no longer verifies against the manifest.`
    );
  }

  // Production publish approves a record that already went through Sandbox review - it must not
  // be able to fast-track a backlog record straight to production before anyone has seen a
  // Sandbox draft of it.
  const distribution = readJson(staged.distributionPath);
  const sandboxZenodo = distribution?.zenodo;
  if (!sandboxZenodo || sandboxZenodo.environment !== "zenodo-sandbox" || sandboxZenodo.status !== "draft") {
    throw new Error(
      `${recordId} has not completed a Zenodo Sandbox draft sync yet (distribution.zenodo: ${JSON.stringify(sandboxZenodo)}). ` +
        "Run Research Sync to produce and review a Sandbox draft before dispatching a production publish."
    );
  }

  // A prior Sandbox draft existing isn't enough on its own - record.json or the canonical file
  // could have been edited since that draft was reviewed, and update-distribution.mjs never
  // reruns to notice. Require the record's current content to still match what was fingerprinted
  // when that Sandbox draft was produced (see metadataFingerprint / update-distribution.mjs).
  const record = readJson(staged.recordPath);
  const currentFingerprint = metadataFingerprint(record, staged.canonical.sha256);
  if (!sandboxZenodo.reviewed_fingerprint || sandboxZenodo.reviewed_fingerprint !== currentFingerprint) {
    throw new Error(
      `${recordId}'s record metadata or canonical file has changed since its Sandbox draft was reviewed. ` +
        "Re-run Research Sync to produce a fresh Sandbox draft reflecting the current content before publishing."
    );
  }

  const { recordPath, manifestPath, distributionPath, canonical } = staged;
  writeJson(
    CURRENT_PATH,
    buildCurrentState({
      recordId,
      recordPath,
      manifestPath,
      distributionPath,
      canonicalPath: canonical.path,
      environment: "zenodo-production",
      queuedAt: new Date().toISOString()
    })
  );
}

// A genuine manual workflow_dispatch run (e.g. the reviewed-record production publish step) is
// the human approving one specific record - identified by record_id - not advancing the
// sequential backlog. research-sync.yml's own "Continue the backlog" step also dispatches via
// workflow_dispatch to get around GITHUB_TOKEN's push-trigger restriction, but that internal
// continuation must be treated like a push (advance the backlog), not a manual-publish request -
// it sets CONTINUE_BACKLOG=true to say so.
const isManualPublish = process.env.GITHUB_EVENT_NAME === "workflow_dispatch" && process.env.CONTINUE_BACKLOG !== "true";
if (isManualPublish) {
  const targetRecordId = process.env.TARGET_RECORD_ID;
  if (targetRecordId) {
    stageForManualPublish(targetRecordId);
    console.log(`Manual run: staged ${targetRecordId} for production publish, regardless of what queue/current.json held before.`);
    setOutput("ready", "true");
  } else {
    const staged = readJson(CURRENT_PATH);
    if (staged) {
      console.log(`Manual run: no record_id given; using the record already staged in queue/current.json: ${staged.record_id}.`);
      setOutput("ready", "true");
    } else {
      notReady("Manual run: queue/current.json is empty and no record_id was given; provide record_id or stage a record first.");
    }
  }
  process.exit(0);
}

const existingCurrent = readJson(CURRENT_PATH);
if (existingCurrent && !existingCurrent.processed_at) {
  console.log(`queue/current.json already has an unprocessed record queued: ${existingCurrent.record_id}`);
  setOutput("ready", "true");
  process.exit(0);
}

const pending = readJson(PENDING_PATH);
if (!pending) throw new Error(`${PENDING_PATH} is missing.`);

// update-distribution.mjs writes queue/current.json's processed_at before it clears
// pending.json's current_record_id/status. If it (or the runner) stopped between those two
// writes, pending.json still claims the just-finished record is active, which would otherwise
// block promotion forever under max_active_records. Reconcile it here.
if (existingCurrent?.processed_at && pending.current_record_id === existingCurrent.record_id) {
  const staleEntry = (pending.records || []).find((item) => item.record_id === existingCurrent.record_id);
  if (staleEntry) {
    staleEntry.status =
      existingCurrent.status === "failed" ? "sync-failed" : existingCurrent.published ? "published" : "synced-draft";
  }
  pending.current_record_id = null;
  writeJson(PENDING_PATH, pending);
  console.log(`Reconciled ${existingCurrent.record_id}'s pending-queue status after an interrupted write-back.`);
}

// queue/current.json can be entirely absent while pending.json still claims a record is
// active, if an earlier promotion was interrupted after updating pending.json but before
// queue/current.json was written. Resume that exact record instead of treating the active
// slot as permanently occupied. (If queue/current.json exists and is already processed, this
// is not that scenario - leave it for the normal write-back in update-distribution.mjs.)
if (!existingCurrent && pending.current_record_id) {
  const resumeEntry = (pending.records || []).find(
    (item) => item.record_id === pending.current_record_id && item.status === "queued_for_sync"
  );
  if (resumeEntry) {
    const resumed = verifyCanonicalFile(resumeEntry);
    if (resumed) {
      writePromotion(resumed, pending);
      console.log(`Resumed interrupted promotion of ${resumeEntry.record_id}.`);
      setOutput("ready", "true");
      process.exit(0);
    }
    throw new Error(
      `${resumeEntry.record_id} is marked queued_for_sync in ${PENDING_PATH} but its canonical file no longer verifies; ` +
        "resolve this manually before promotion can continue."
    );
  }
}

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
  promoted = verifyCanonicalFile(entry);
  if (promoted) break;
}

if (!promoted) {
  notReady("No pending record has its canonical file attached yet; nothing to promote.");
  process.exit(0);
}

writePromotion(promoted, pending);
console.log(`Promoted ${promoted.entry.record_id} to queue/current.json.`);
setOutput("ready", "true");
