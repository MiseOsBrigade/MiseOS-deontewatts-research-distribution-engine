import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const required = ["GITHUB_TOKEN", "GITHUB_REPOSITORY", "UPLOAD_API_KEY"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  return NextResponse.json(
    { ok: missing.length === 0, service: "research-upload-console", missing },
    { status: missing.length === 0 ? 200 : 503 },
  );
}
