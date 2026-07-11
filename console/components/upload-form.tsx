"use client";

import { FormEvent, useState } from "react";

type Result = {
  ok: boolean;
  error?: string;
  uploadPath?: string;
  sha256?: string;
  bytes?: number;
  commitUrl?: string;
};

export function UploadForm() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: new FormData(event.currentTarget),
      });
      const payload = (await response.json()) as Result;
      setResult(payload);
      if (payload.ok) event.currentTarget.reset();
    } catch {
      setResult({ ok: false, error: "The upload service could not be reached." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
      <label className="block"><span>Intake key</span><input required type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
      <label className="block"><span>Research file</span><input required name="file" type="file" accept=".pdf,.zip,.json,.csv,.md,.markdown,.txt" className="mt-2 block w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
      <label className="block"><span>Title</span><input required name="title" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
      <label className="block"><span>Abstract</span><textarea required name="description" rows={5} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
      <div className="grid gap-5 md:grid-cols-2">
        <label><span>Creator</span><input required name="creator" defaultValue="Watts, Deonte" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
        <label><span>ORCID</span><input name="orcid" defaultValue="0009-0005-8586-3650" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
      </div>
      <label className="block"><span>Keywords, comma separated</span><input name="keywords" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
      <div className="grid gap-5 md:grid-cols-3">
        <label><span>License</span><input required name="license" defaultValue="cc-by-4.0" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
        <label><span>Upload type</span><input required name="upload_type" defaultValue="publication" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
        <label><span>Publication type</span><input name="publication_type" defaultValue="technicalnote" className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3" /></label>
      </div>
      <button disabled={busy} className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-black disabled:opacity-50">{busy ? "Queuing…" : "Queue research upload"}</button>
      {result && <div className={`rounded-xl p-4 text-sm ${result.ok ? "bg-emerald-500/15" : "bg-red-500/15"}`}>{result.ok ? <><p>Queued: {result.uploadPath}</p><p className="break-all">SHA-256: {result.sha256}</p>{result.commitUrl && <p><a className="underline" href={result.commitUrl} target="_blank" rel="noreferrer">View atomic commit</a></p>}</> : <p>{result.error}</p>}</div>}
    </form>
  );
}
