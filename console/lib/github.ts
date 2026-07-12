import { createHash } from "node:crypto";

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

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function config() {
  const [owner, repo] = required("GITHUB_REPOSITORY").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPOSITORY must use owner/repo format.");
  return {
    owner,
    repo,
    token: required("GITHUB_TOKEN"),
    branch: process.env.GITHUB_BRANCH?.trim() || "main",
    prefix: (process.env.UPLOAD_PATH_PREFIX?.trim() || "uploads").replace(/^\/+|\/+$/g, ""),
  };
}

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = config();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

async function createBlob(content: Buffer | string, encoding: "base64" | "utf-8") {
  const { owner, repo } = config();
  return github<GitBlob>(`/repos/${owner}/${repo}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({
      content: Buffer.isBuffer(content) ? content.toString("base64") : content,
      encoding,
    }),
  });
}

export async function queueResearchUpload(input: { filename: string; file: Buffer; metadata: UploadMetadata }) {
  const { owner, repo, branch, prefix } = config();
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!safeName || safeName === "." || safeName === "..") throw new Error("Invalid filename.");

  const digest = createHash("sha256").update(input.file).digest("hex");
  const uploadPath = `${prefix}/${Date.now()}-${safeName}`;
  const metadataText = `${JSON.stringify(input.metadata, null, 2)}\n`;

  const ref = await github<GitRef>(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parent = await github<GitCommit>(`/repos/${owner}/${repo}/git/commits/${parentSha}`);
  const [fileBlob, metadataBlob] = await Promise.all([
    createBlob(input.file, "base64"),
    createBlob(metadataText, "utf-8"),
  ]);

  const tree = await github<GitTree>(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: [
        { path: uploadPath, mode: "100644", type: "blob", sha: fileBlob.sha },
        { path: "metadata/research.json", mode: "100644", type: "blob", sha: metadataBlob.sha },
      ],
    }),
  });

  const commit = await github<CreatedCommit>(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `upload: queue ${safeName}`,
      tree: tree.sha,
      parents: [parentSha],
    }),
  });

  await github(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    uploadPath,
    sha256: digest,
    bytes: input.file.byteLength,
    commitSha: commit.sha,
    commitUrl: commit.html_url || `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
  };
}
