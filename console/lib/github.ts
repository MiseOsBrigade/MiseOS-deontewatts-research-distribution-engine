import { createHash, randomUUID } from "node:crypto";

export type UploadMetadata = {
  title: string;
  description: string;
  creators: Array<{ name: string; orcid?: string }>;
  keywords: string[];
  license: string;
  upload_type: string;
  publication_type?: string;
  publication_date: string;
  access_right: string;
  related_identifiers: Array<Record<string, string>>;
};

type GitRef = { object: { sha: string } };
type GitCommit = { tree: { sha: string } };
type GitBlob = { sha: string };
type GitTree = { sha: string };
type CreatedCommit = { sha: string; html_url?: string };
type ContentFile = { content: string; encoding: string };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function config() {
  const [owner, repo] = required("GITHUB_REPOSITORY").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPOSITORY must use owner/repo format.");
  return { owner, repo, token: required("GITHUB_TOKEN"), branch: process.env.GITHUB_BRANCH?.trim() || "main", prefix: (process.env.UPLOAD_PATH_PREFIX?.trim() || "uploads").replace(/^\/+|\/+$/g, "") };
}

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = config();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers || {}) }
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

async function createBlob(content: Buffer | string, encoding: "base64" | "utf-8") {
  const { owner, repo } = config();
  return github<GitBlob>(`/repos/${owner}/${repo}/git/blobs`, { method: "POST", body: JSON.stringify({ content: Buffer.isBuffer(content) ? content.toString("base64") : content, encoding }) });
}

async function readRepositoryJson(path: string): Promise<Record<string, unknown> | null> {
  const { owner, repo, branch } = config();
  try {
    const file = await github<ContentFile>(`/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    return JSON.parse(Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("GitHub API 404")) return null;
    throw error;
  }
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "record";
}

export async function queueResearchUpload(input: { filename: string; file: Buffer; metadata: UploadMetadata }) {
  const { owner, repo, branch, prefix } = config();
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!safeName || safeName === "." || safeName === "..") throw new Error("Invalid filename.");
  const now = new Date().toISOString();
  const digest = createHash("sha256").update(input.file).digest("hex");
  const recordId = `${now.slice(0, 10)}-${slugify(input.metadata.title)}-${createHash("sha256").update(`${digest}-${randomUUID()}`).digest("hex").slice(0, 10)}`;
  const uploadPath = `${prefix}/${recordId}/${safeName}`;
  const recordPath = `records/${recordId}/record.json`;
  const distributionPath = `records/${recordId}/distribution.json`;
  const manifestPath = `records/${recordId}/manifest.json`;
  const record = {
    id: recordId,
    kind: input.metadata.upload_type === "dataset" ? "dataset" : input.metadata.upload_type === "software" ? "software" : "publication",
    ...input.metadata,
    files: [{ path: uploadPath, filename: safeName, bytes: input.file.byteLength, sha256: digest, media_type: "application/octet-stream" }],
    identifiers: {},
    source: { type: "console-upload" },
    distribution: { github: { status: "stored", path: uploadPath }, zenodo: { status: "queued" }, orcid: { status: "pending-analysis" } },
    created_at: now,
    updated_at: now
  };
  const summary = { id: record.id, kind: record.kind, title: record.title, creators: record.creators, identifiers: record.identifiers, source: record.source, distribution: record.distribution, record_path: recordPath, created_at: now, updated_at: now };
  const currentIndex = (await readRepositoryJson("data/research-index.json")) as { records?: Array<Record<string, unknown>> } | null;
  const records = Array.isArray(currentIndex?.records) ? currentIndex.records.filter((entry) => entry.id !== recordId) : [];
  records.unshift(summary);
  const index = { schema_version: "1.0.0", updated_at: now, records };
  const queue = { schema_version: "1.0.0", record_id: recordId, metadata_path: recordPath, files: [uploadPath], environment: "zenodo-sandbox", status: "queued", queued_at: now };
  const ref = await github<GitRef>(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parent = await github<GitCommit>(`/repos/${owner}/${repo}/git/commits/${parentSha}`);
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const blobs = await Promise.all([
    createBlob(input.file, "base64"), createBlob(json(input.metadata), "utf-8"), createBlob(json(record), "utf-8"),
    createBlob(json(record.distribution), "utf-8"), createBlob(json({ record_id: recordId, files: record.files }), "utf-8"),
    createBlob(json(index), "utf-8"), createBlob(json(queue), "utf-8")
  ]);
  const paths = [uploadPath, "metadata/research.json", recordPath, distributionPath, manifestPath, "data/research-index.json", "queue/current.json"];
  const tree = await github<GitTree>(`/repos/${owner}/${repo}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree: paths.map((path, index) => ({ path, mode: "100644", type: "blob", sha: blobs[index].sha })) }) });
  const commit = await github<CreatedCommit>(`/repos/${owner}/${repo}/git/commits`, { method: "POST", body: JSON.stringify({ message: `upload: queue ${safeName} as ${recordId}`, tree: tree.sha, parents: [parentSha] }) });
  await github(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
  return { recordId, recordPath, uploadPath, sha256: digest, bytes: input.file.byteLength, commitSha: commit.sha, commitUrl: commit.html_url || `https://github.com/${owner}/${repo}/commit/${commit.sha}` };
}
