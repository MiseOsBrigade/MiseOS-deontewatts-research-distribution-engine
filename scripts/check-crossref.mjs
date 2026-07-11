const doi = process.argv[2];
if (!doi) {
  console.error("Usage: node scripts/check-crossref.mjs <doi>");
  process.exit(1);
}

const base = process.env.CROSSREF_API_BASE || "https://api.crossref.org";
const mailto = process.env.CROSSREF_MAILTO;
const url = new URL(`${base}/works/${encodeURIComponent(doi)}`);
if (mailto) url.searchParams.set("mailto", mailto);

const response = await fetch(url, {
  headers: { Accept: "application/json" }
});

if (response.status === 404) {
  console.log(JSON.stringify({ found: false, doi }, null, 2));
  process.exit(0);
}

if (!response.ok) {
  throw new Error(`Crossref request failed: ${response.status} ${await response.text()}`);
}

const payload = await response.json();
const work = payload.message;

console.log(JSON.stringify({
  found: true,
  doi: work.DOI,
  title: work.title?.[0] ?? null,
  type: work.type ?? null,
  publisher: work.publisher ?? null,
  url: work.URL ?? null
}, null, 2));
