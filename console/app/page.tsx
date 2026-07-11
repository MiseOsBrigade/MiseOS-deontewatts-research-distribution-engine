import { UploadForm } from "@/components/upload-form";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <p className="mb-3 font-mono text-sm uppercase tracking-[0.3em] text-cyan-300">Research Distribution Engine</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Secure research upload console</h1>
        <p className="mb-10 mt-5 max-w-2xl text-lg text-neutral-400">One authenticated upload creates one atomic Git commit containing both the binary file and matching research metadata. GitHub Actions then validates and starts the Zenodo workflow.</p>
        <UploadForm />
      </div>
    </main>
  );
}
