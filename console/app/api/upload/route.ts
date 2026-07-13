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
const allowedUploadTypes = new Set(["publication", "dataset", "software", "poster", "presentation", "other"]);
const allowedPublicationTypes = new Set(["article", "book", "booksection", "conferencepaper", "report", "technicalnote", "thesis", "workingpaper", "other"]);
const allowedAccessRights = new Set(["open", "embargoed", "restricted", "closed"]);
const allowedRelations = new Set(["isSupplementTo", "isVersionOf", "isPartOf", "references", "isIdenticalTo"]);

function text(form: FormData, key: string, required = true, maxLength = 10000) {
  const value = String(form.get(key) || "").trim();
  if (required && !value) throw new Error(`${key} is required.`);
  if (value.length > maxLength) throw new Error(`${key} exceeds ${maxLength} characters.`);
  return value;
}

function choice(form: FormData, key: string, allowed: Set<string>, required = true) {
  const value = text(form, key, required, 100);
  if (value && !allowed.has(value)) throw new Error(`${key} has an unsupported value.`);
  return value;
}

function validateOrcid(value: string) {
  if (value && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(value)) throw new Error("ORCID format is invalid.");
}

function validateDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date.`);
  }
}

function validateDoi(value: string) {
  if (value && !/^10\.\d{4,9}\/\S+$/i.test(value)) throw new Error("doi format is invalid.");
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request);
    enforceRateLimit(request);
    if (!verifyIntakeKey(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }

    const form = await request.formData();
    if (text(form, "confirm_metadata") !== "yes") throw new Error("Metadata confirmation is required.");

    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("file is required.");

    const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 25000000);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error("MAX_UPLOAD_BYTES is invalid.");
    if (file.size <= 0) throw new Error("The uploaded file is empty.");
    if (file.size > maxBytes) throw new Error(`The file exceeds the ${maxBytes}-byte limit.`);

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.has(extension)) throw new Error(`Unsupported file extension: .${extension || "unknown"}`);
    if (file.type && !allowedTypes.has(file.type)) throw new Error(`Unsupported file type: ${file.type}`);

    const creator = text(form, "creator", true, 500);
    const orcid = text(form, "orcid", false, 19);
    validateOrcid(orcid);

    const title = text(form, "title", true, 250);
    if (title.length < 3) throw new Error("title must contain at least 3 characters.");
    const description = text(form, "description", true, 10000);
    if (description.length < 40) throw new Error("description must contain at least 40 characters.");

    const publicationDate = text(form, "publication_date", true, 10);
    validateDate(publicationDate, "publication_date");

    const uploadType = choice(form, "upload_type", allowedUploadTypes);
    const publicationType = choice(form, "publication_type", allowedPublicationTypes, uploadType === "publication");
    const accessRight = choice(form, "access_right", allowedAccessRights);
    const embargoDate = text(form, "embargo_date", false, 10);
    if (accessRight === "embargoed") {
      if (!embargoDate) throw new Error("embargo_date is required for embargoed access.");
      validateDate(embargoDate, "embargo_date");
      if (Date.parse(`${embargoDate}T00:00:00Z`) <= Date.now()) throw new Error("embargo_date must be in the future.");
    }

    const doi = text(form, "doi", false, 255);
    validateDoi(doi);
    const relatedIdentifier = text(form, "related_identifier", false, 1000);
    const relation = choice(form, "relation", allowedRelations, false);

    const metadata: UploadMetadata = {
      title,
      description,
      creators: [{ name: creator, ...(orcid ? { orcid } : {}) }],
      keywords: text(form, "keywords", false, 2000).split(",").map((value) => value.trim()).filter(Boolean).slice(0, 50),
      license: text(form, "license", true, 100),
      upload_type: uploadType,
      ...(publicationType ? { publication_type: publicationType } : {}),
      publication_date: publicationDate,
      access_right: accessRight,
      ...(embargoDate ? { embargo_date: embargoDate } : {}),
      ...(text(form, "language", false, 3) ? { language: text(form, "language", false, 3).toLowerCase() } : {}),
      ...(text(form, "version", false, 50) ? { version: text(form, "version", false, 50) } : {}),
      ...(text(form, "notes", false, 2000) ? { notes: text(form, "notes", false, 2000) } : {}),
      ...(doi ? { doi } : {}),
      related_identifiers: relatedIdentifier ? [{ identifier: relatedIdentifier, relation: relation || "isSupplementTo" }] : [],
    };

    const result = await queueResearchUpload({
      filename: file.name,
      file: Buffer.from(await file.arrayBuffer()),
      metadata,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = message.includes("rate limit") ? 429 : message === "Unauthorized." ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
