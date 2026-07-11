import { NextResponse } from "next/server";
import { queueResearchUpload, type UploadMetadata } from "@/lib/github";
import { assertAllowedOrigin, enforceRateLimit, verifyIntakeKey } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTypes = new Set([
  "application/pdf",
  "application/zip",
  "application/json",
  "text/csv",
  "text/markdown",
  "text/plain",
]);
const allowedExtensions = new Set(["pdf", "zip", "json", "csv", "md", "markdown", "txt"]);

function text(form: FormData, key: string, required = true) {
  const value = String(form.get(key) || "").trim();
  if (required && !value) throw new Error(`${key} is required.`);
  return value;
}

function validateOrcid(value: string) {
  if (value && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(value)) throw new Error("ORCID format is invalid.");
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request);
    enforceRateLimit(request);
    if (!verifyIntakeKey(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("file is required.");

    const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 25000000);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("MAX_UPLOAD_BYTES is invalid.");
    if (file.size <= 0) throw new Error("The uploaded file is empty.");
    if (file.size > maxBytes) throw new Error(`The file exceeds the ${maxBytes}-byte limit.`);

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.has(extension)) throw new Error(`Unsupported file extension: .${extension || "unknown"}`);
    if (file.type && !allowedTypes.has(file.type)) throw new Error(`Unsupported file type: ${file.type}`);

    const creator = text(form, "creator");
    const orcid = text(form, "orcid", false);
    validateOrcid(orcid);

    const metadata: UploadMetadata = {
      title: text(form, "title"),
      description: text(form, "description"),
      creators: [{ name: creator, ...(orcid ? { orcid } : {}) }],
      keywords: text(form, "keywords", false).split(",").map((value) => value.trim()).filter(Boolean).slice(0, 50),
      license: text(form, "license") || "cc-by-4.0",
      upload_type: text(form, "upload_type") || "publication",
      publication_type: text(form, "publication_type", false) || "technicalnote",
      publication_date: new Date().toISOString().slice(0, 10),
      access_right: "open",
      related_identifiers: [],
    };

    const result = await queueResearchUpload({
      filename: file.name,
      file: Buffer.from(await file.arrayBuffer()),
      metadata,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = message.includes("rate limit") ? 429 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
