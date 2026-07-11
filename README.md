# Research Sync

Neutral research-distribution configuration using:

- GitHub as the source repository and automation runner
- Zenodo for deposits, archival releases, and DOI minting
- ORCID for researcher identity and public-record lookup
- Crossref for DOI metadata retrieval and verification
- OpenAIRE for discovery checks
- Medium for optional public summaries
- Web of Science for optional indexing checks
- Academia.edu as a manually approved upload destination

## Security model

1. Never place access tokens or client secrets in source files.
2. Store secrets in GitHub Actions Secrets.
3. Store public identifiers and API base URLs in GitHub Actions Variables.
4. Use Zenodo Sandbox until the workflow is validated.
5. Publishing a Zenodo record requires a manual workflow input.

## Required GitHub variables

- `ORCID_ID`
- `ORCID_API_BASE`
- `ZENODO_BASE_URL`
- `CROSSREF_API_BASE`
- `CROSSREF_MAILTO`
- `OPENAIRE_API_BASE`

## Required GitHub secrets

- `ZENODO_ACCESS_TOKEN`

Optional secrets:

- `ORCID_CLIENT_ID`
- `ORCID_CLIENT_SECRET`
- `MEDIUM_TOKEN`
- `WEB_OF_SCIENCE_API_KEY`

## Local validation

```bash
node scripts/validate-metadata.mjs
node scripts/check-crossref.mjs "10.5281/zenodo.0000000"
```

## GitHub workflow

Run **Research Sync** manually. Keep `publish_zenodo` set to `false` for test runs.
