import { UploadForm } from "@/components/upload-form";

const papers = [
  {
    title: "Mirror-Coupled Hidden Sectors",
    focus: "Gauge theory, asymmetric abundance, Yukawa scattering regimes, and consistency conditions.",
  },
  {
    title: "Velocity-Dependent Self-Interactions",
    focus: "Dwarf-to-cluster phenomenology, cosmological constraints, and falsification tests.",
  },
  {
    title: "Coupling Constants Across Scales",
    focus: "Atomic scaling, hidden-sector analogy, model comparison, and discovery criteria.",
  },
];

const repositoryUrl = "https://github.com/MiseOsBrigade/MiseOS-deontewatts-research-distribution-engine/tree/main/research/mirror-coupled-dark-sector/v0.1.0";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <p className="mb-3 font-mono text-sm uppercase tracking-[0.3em] text-cyan-300">Research Distribution Engine</p>
        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">Mirror-Coupled Dark Sector Research Program</h1>
        <p className="mt-5 max-w-3xl text-lg text-neutral-400">
          A three-manuscript theoretical program testing the falsifiable conjecture that a hidden-sector gauge coupling may match the visible fine-structure constant at a defined renormalization scale.
        </p>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {papers.map((paper, index) => (
            <article key={paper.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300">Paper {index + 1}</p>
              <h2 className="mt-3 text-xl font-semibold">{paper.title}</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-400">{paper.focus}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300">Release v0.1.0</p>
              <h2 className="mt-2 text-2xl font-semibold">Open research assets</h2>
              <p className="mt-3 text-neutral-400">LaTeX sources, reproducibility scripts, Zenodo metadata, claim ledger, citation metadata, and publication files are managed as one versioned release.</p>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl bg-black/25 p-4"><dt className="text-neutral-500">Author</dt><dd className="mt-1">Deonte Watts</dd></div>
              <div className="rounded-xl bg-black/25 p-4"><dt className="text-neutral-500">ORCID</dt><dd className="mt-1">0009-0005-8586-3650</dd></div>
              <div className="rounded-xl bg-black/25 p-4"><dt className="text-neutral-500">License</dt><dd className="mt-1">CC BY 4.0</dd></div>
              <div className="rounded-xl bg-black/25 p-4"><dt className="text-neutral-500">DOI</dt><dd className="mt-1">Pending Zenodo approval</dd></div>
            </dl>
          </div>
          <a href={repositoryUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex rounded-xl border border-cyan-300/40 px-5 py-3 font-semibold text-cyan-200 hover:bg-cyan-300/10">Browse release files and citations</a>
        </section>

        <section className="mt-16">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Publisher console</p>
          <h2 className="text-3xl font-semibold">Queue a master publication</h2>
          <p className="mb-8 mt-3 max-w-3xl text-neutral-400">One authenticated upload creates the binary asset, metadata record, checksum manifest, distribution state, and GitHub queue entry, then registers the publication with the 3Min Research Registry.</p>
          <UploadForm />
        </section>
      </div>
    </main>
  );
}
