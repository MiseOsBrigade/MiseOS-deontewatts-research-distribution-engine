import type { UploadMetadata } from "@/lib/github";

type RegistryPayload = {
  title: string;
  record_type: string;
  creator: string;
  orcid: string;
  publication_date: string;
};

export type RegistryResult = {
  configured: boolean;
  accepted: boolean;
  recordId?: string;
  error?: string;
};

export async function registerResearchMetadata(metadata: UploadMetadata): Promise<RegistryResult> {
  const endpoint = process.env.THREEMIN_API_URL?.trim();
  const apiKey = process.env.THREEMIN_API_KEY?.trim();

  if (!endpoint || !apiKey) {
    return { configured: false, accepted: false };
  }

  const creator = metadata.creators[0];
  const payload: RegistryPayload = {
    title: metadata.title,
    record_type: metadata.publication_type || metadata.upload_type,
    creator: creator?.name || "Unknown creator",
    orcid: creator?.orcid || "not-provided",
    publication_date: metadata.publication_date,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      return {
        configured: true,
        accepted: false,
        error: body.error || body.message || `Registry returned HTTP ${response.status}.`,
      };
    }

    return { configured: true, accepted: true, ...(body.id ? { recordId: body.id } : {}) };
  } catch (error) {
    return {
      configured: true,
      accepted: false,
      error: error instanceof Error ? error.message : "Registry request failed.",
    };
  }
}
