"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type Result = {
  ok: boolean;
  error?: string;
  uploadPath?: string;
  recordId?: string;
  sha256?: string;
  bytes?: number;
  commitUrl?: string;
  registry?: {
    configured: boolean;
    accepted: boolean;
    recordId?: string;
    error?: string;
  };
};

const inputClass = "mt-2 w-full rounded-lg border border-white/10 bg-black/30 p-3 outline-none transition focus:border-cyan-300";

export function UploadForm() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [accessRight, setAccessRight] = useState("open");
  const [uploadType, setUploadType] = useState("publication");

  const publicationTypeRequired = uploadType === "publication";
  const canSubmit = useMemo(() => key.trim().length > 0 && !busy, [key, busy]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || title) return;
    setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: new FormData(form),
      });
      const payload = (await response.json()) as Result;
      setResult(payload);
      if (payload.ok) {
        form.reset();
        setTitle("");
        setAccessRight("open");
        setUploadType("publication");
      }
    } catch (error) {
      console.error("Upload request failed:", error);
      setResult({ ok: false, error: "The upload service could not be reached." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-7 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:p-8">
      <section className="space-y-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Step 1</p>
          <h2 className="mt-1 text-xl font-semibold">Choose the master file</h2>
        </div>
        <label className="block">
          <span>Research file</span>
          <input required name="file" type="file" onChange={selectFile} accept=".pdf,.zip,.json,.csv,.md,.markdown,.txt" className={inputClass} />
          <small className="mt-2 block text-neutral-400">PDF, ZIP, JSON, CSV, Markdown, or text. Maximum size is controlled by MAX_UPLOAD_BYTES.</small>
        </label>
      </section>

      <section className="space-y-5 border-t border-white/10 pt-7">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Step 2</p>
          <h2 className="mt-1 text-xl font-semibold">Describe the publication</h2>
        </div>
        <label className="block"><span>Title</span><input required name="title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={250} className={inputClass} /></label>
        <label className="block"><span>Abstract</span><textarea required name="description" rows={7} minLength={40} maxLength={10000} placeholder="Purpose, methods, findings, and significance." className={inputClass} /></label>
        <div className="grid gap-5 md:grid-cols-2">
          <label><span>Creator</span><input required name="creator" defaultValue="Watts, Deonte" className={inputClass} /></label>
          <label><span>ORCID</span><input name="orcid" defaultValue="0009-0005-8586-3650" pattern="\d{4}-\d{4}-\d{4}-\d{3}[\dX]" className={inputClass} /></label>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <label><span>Publication date</span><input required name="publication_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} /></label>
          <label><span>Language</span><input name="language" defaultValue="eng" maxLength={3} placeholder="eng" className={inputClass} /></label>
        </div>
        <label className="block"><span>Keywords</span><input name="keywords" placeholder="ethical AI, research infrastructure, MiseOS" className={inputClass} /><small className="mt-2 block text-neutral-400">Separate keywords with commas.</small></label>
        <div className="grid gap-5 md:grid-cols-3">
          <label><span>Upload type</span><select required name="upload_type" value={uploadType} onChange={(event) => setUploadType(event.target.value)} className={inputClass}><option value="publication">Publication</option><option value="dataset">Dataset</option><option value="software">Software</option><option value="poster">Poster</option><option value="presentation">Presentation</option><option value="other">Other</option></select></label>
          <label><span>Publication type</span><select name="publication_type" required={publicationTypeRequired} defaultValue="technicalnote" disabled={!publicationTypeRequired} className={inputClass}><option value="article">Article</option><option value="book">Book</option><option value="booksection">Book section</option><option value="conferencepaper">Conference paper</option><option value="report">Report</option><option value="technicalnote">Technical note</option><option value="thesis">Thesis</option><option value="workingpaper">Working paper</option><option value="other">Other</option></select></label>
          <label><span>License</span><select required name="license" defaultValue="cc-by-4.0" className={inputClass}><option value="cc-by-4.0">CC BY 4.0</option><option value="cc-by-sa-4.0">CC BY-SA 4.0</option><option value="cc0-1.0">CC0 1.0</option><option value="mit-license">MIT</option><option value="other-open">Other open license</option></select></label>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <label><span>Version</span><input name="version" placeholder="1.0.0" maxLength={50} className={inputClass} /></label>
          <label><span>Existing DOI (optional)</span><input name="doi" placeholder="10.xxxx/xxxxx" className={inputClass} /></label>
        </div>
      </section>

      <section className="space-y-5 border-t border-white/10 pt-7">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Step 3</p>
          <h2 className="mt-1 text-xl font-semibold">Access and relationships</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <label><span>Access</span><select required name="access_right" value={accessRight} onChange={(event) => setAccessRight(event.target.value)} className={inputClass}><option value="open">Open</option><option value="embargoed">Embargoed</option><option value="restricted">Restricted</option><option value="closed">Closed</option></select></label>
          {accessRight === "embargoed" && <label><span>Embargo end date</span><input required name="embargo_date" type="date" min={new Date().toISOString().slice(0, 10)} className={inputClass} /></label>}
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <label className="md:col-span-2"><span>Related identifier</span><input name="related_identifier" placeholder="DOI, URL, arXiv ID, or other identifier" className={inputClass} /></label>
          <label><span>Relationship</span><select name="relation" defaultValue="isSupplementTo" className={inputClass}><option value="isSupplementTo">Supplements</option><option value="isVersionOf">Version of</option><option value="isPartOf">Part of</option><option value="references">References</option><option value="isIdenticalTo">Identical to</option></select></label>
        </div>
        <label className="block"><span>Publisher notes</span><textarea name="notes" rows={3} maxLength={2000} placeholder="Review notes, funding context, acknowledgments, or release instructions." className={inputClass} /></label>
      </section>

      <section className="space-y-5 border-t border-white/10 pt-7">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Step 4</p>
          <h2 className="mt-1 text-xl font-semibold">Authorize and queue</h2>
        </div>
        <label className="block"><span>Intake key</span><input required type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" className={inputClass} /></label>
        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4"><input required name="confirm_metadata" value="yes" type="checkbox" className="mt-1" /><span className="text-sm text-neutral-300">I confirm the file, authorship, title, abstract, license, and access settings are ready for the sandbox publishing queue.</span></label>
      </section>

      <button disabled={!canSubmit} className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Validating and queuing…" : "Validate and queue master publication"}</button>
      {result && <div role="status" className={`rounded-xl p-4 text-sm ${result.ok ? "bg-emerald-500/15" : "bg-red-500/15"}`}>{result.ok ? <><p className="font-semibold">Publication queued successfully.</p>{result.recordId && <p>Record: {result.recordId}</p>}<p>Path: {result.uploadPath}</p><p className="break-all">SHA-256: {result.sha256}</p>{result.commitUrl && <p className="mt-2"><a className="underline" href={result.commitUrl} target="_blank" rel="noreferrer">View atomic GitHub commit</a></p>}{result.registry?.configured && !result.registry.accepted && <p className="mt-2 text-amber-300">External registry sync did not complete: {result.registry.error || "unknown error"}.</p>}</> : <p>{result.error}</p>}</div>}
    </form>
  );
}
