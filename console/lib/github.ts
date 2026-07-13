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
  embargo_date?: string;
  language?: string;
  version?: string;
  notes?: string;
  doi?: string;
  related_identifiers: Array<Record<string, string>>;
};

type GitRef = { object: { sha: string } };
type GitCommit = { tree: { sha: string } };
type GitBlob = { sha: string };
type GitTree = { sha: string };
type CreatedCommit = { sha: string; html_url?: string };
type ContentFile = { content: string; encoding: "base64" | string };
type ResearchIndex = {
  schema_version: string;
  updated_at: string;
  records: Array<Record<string, unknown> & { id?: string }>;
};

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

  if (!response.ok) {
    const error = new Error(`GitHub API ${response.status}: ${await response.text()}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
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

async function readIndex(branch: string): Promise<ResearchIndex> {
  const { owner, repo } = config();
  try {
    const file = await github<ContentFile>(
      `/repos/${owner}/${repo}/contents/data/research-index.json?ref=${encodeURIComponent(branch)}`,
    );
    const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as ResearchIndex;
    return {
      schema_version: parsed.schema_version || "1.0.0",
      updated_at: parsed.updated_at || new Date(0).toISOString(),
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      return { schema_version: "1.0.0", updated_at: new Date(0).toISOString(), records: [] };
    }
    throw error;
  }
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "research-record";
}

export async function verifyGitHubConnection() {
  const { owner, repo, branch } = config();
  const repository = await github<{ full_name: string; default_branch: string }>(`/repos/${owner}/${repo}`);
  await github<GitRef>(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  return { repository: repository.full_name, branch, reachable: true };
}

export async function queueResearchUpload(input: { filename: string; file: Buffer; metadata: UploadMetadata }) {
  const { owner, repo, branch, prefix } = config();
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!safeName || safeName === "." || safeName === "..") throw new Error("Invalid filename.");

  const digest = createHash("sha256").update(input.file).digest("hex");
  const createdAt = new Date().toISOString();
  const recordId = `${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${slug(input.metadata.title)}-${digest.slice(0, 8)}`;
  const uploadPath = `${prefix}/${recordId}/${safeName}`;
  const recordPath = `records/${recordId}/record.json`;
  const manifestPath = `records/${recordId}/manifest.json`;
  const distributionPath = `records/${recordId}/distribution.json`;

  const record = {
    id: recordId,
    kind: input.metadata.upload_type === "dataset" ? "dataset" : input.metadata.upload_type === "software" ? "software" : "publication",
    status: "queued-sandbox",
    title: input.metadata.title,
    description: input.metadata.description,
    creators: input.metadata.creators,
    keywords: input.metadata.keywords,
    license: input.metadata.license,
    upload_type: input.metadata.upload_type,
    publication_type: input.metadata.publication_type,
    publication_date: input.metadata.publication_date,
    access_right: input.metadata.access_right,
    embargo_date: input.metadata.embargo_date,
    language: input.metadata.language,
    version: input.metadata.version,
    notes: input.metadata.notes,
    doi: input.metadata.doi,
    related_identifiers: input.metadata.related_identifiers,
    identifiers: { doi: input.metadata.doi || null, reserved_doi: null },
    files: [{ path: uploadPath, filename: safeName, role: "canonical", bytes: input.file.byteLength, sha256: digest }],
    distribution: { zenodo: "queued-sandbox", orcid: "blocked-until-doi" },
    created_at: createdAt,
    updated_at: createdAt,
  };

  const manifest = {
    record_id: recordId,
    files: record.files,
    validation: { checksum_required: true, all_files_present: true, metadata_confirmed: true },
    created_at: createdAt,
  };

  const distribution = {
    record_id: recordId,
    publication_enabled: false,
    zenodo: { environment: "zenodo-sandbox", status: "queued", published: false, reserved_doi: null },
    orcid: { status: "blocked-until-reserved-doi", write_back_enabled: false, approval_required: true },
    updated_at: createdAt,
  };

  const queue = {
    record_id: recordId,
    metadata_path: recordPath,
    manifest_path: manifestPath,
    distribution_path: distributionPath,
    files: [uploadPath],
    environment: "zenodo-sandbox",
    publish: false,
    created_at: createdAt,
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const ref = await github<GitRef>(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const parentSha = ref.object.sha;
    const parent = await github<GitCommit>(`/repos/${owner}/${repo}/git/commits/${parentSha}`);
    const index = await readIndex(branch);
    index.updated_at = createdAt;
    index.records = [
      ...index.records.filter((entry) => entry.id !== recordId),
      {
        id: recordId,
        title: input.metadata.title,
        status: "queued-sandbox",
        record_path: recordPath,
        manifest_path: manifestPath,
        distribution_path: distributionPath,
      },
    ];

    const textFiles: Array<[string, string]> = [
      ["metadata/research.json", json(input.metadata)],
      [recordPath, json(record)],
      [manifestPath, json(manifest)],
      [distributionPath, json(distribution)],
      ["data/research-index.json", json(index)],
      ["queue/current.json", json(queue)],
    ];

    const [fileBlob, ...textBlobs] = await Promise.all([
      createBlob(input.file, "base64"),
      ...textFiles.map(([, content]) => createBlob(content, "utf-8")),
    ]);

    const tree = await github<GitTree>(`/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: [
          { path: uploadPath, mode: "100644", type: "blob", sha: fileBlob.sha },
          ...textFiles.map(([path], indexValue) => ({ path, mode: "100644", type: "blob", sha: textBlobs[indexValue].sha })),
        ],
      }),
    });

    const commit = await github<CreatedCommit>(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: `upload: queue ${recordId}`,
        tree: tree.sha,
        parents: [parentSha],
      }),
    });

    try {
      await github(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return {
        recordId,
        uploadPath,
        recordPath,
        sha256: digest,
        bytes: input.file.byteLength,
        commitSha: commit.sha,
        commitUrl: commit.html_url || `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
      };
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (attempt === 3 || (status !== 409 && status !== 422)) throw error;
    }
  }

  throw new Error("Unable to update the GitHub branch after three attempts.");
}
