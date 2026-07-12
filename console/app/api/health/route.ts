import { NextResponse } from "next/server";
import { verifyGitHubConnection } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const required = [
    "GITHUB_TOKEN",
    "GITHUB_REPOSITORY",
    "UPLOAD_API_KEY",
    "GITHUB_BRANCH",
    "UPLOAD_PATH_PREFIX",
    "MAX_UPLOAD_BYTES",
    "UPLOAD_RATE_LIMIT",
    "UPLOAD_RATE_WINDOW_MS",
    "ALLOWED_ORIGINS",
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, service: "research-upload-console", missing, github: { reachable: false } },
      { status: 503 },
    );
  }

  try {
    const github = await verifyGitHubConnection();
    return NextResponse.json({ ok: true, service: "research-upload-console", missing: [], github });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]") : "GitHub connection failed.";
    return NextResponse.json(
      { ok: false, service: "research-upload-console", missing: [], github: { reachable: false }, error: message },
      { status: 503 },
    );
  }
}
