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

## Automation behavior

A push that changes either of these paths starts **Research Sync** automatically:

- `uploads/**`
- `metadata/research.json`

Normal pushes always use the `zenodo-sandbox` GitHub Environment and create a Sandbox draft. They do not permanently publish a production record.

Permanent publication requires a manual **Research Sync** run with:

```text
publish_zenodo: true
```

That manual setting selects the `zenodo-production` GitHub Environment and calls the Zenodo publish action.

## Security model

1. Never place access tokens or client secrets in source files.
2. Store Zenodo tokens as environment-scoped GitHub Actions secrets.
3. Store public identifiers and API base URLs as GitHub Actions variables.
4. Use separate Sandbox and production Zenodo tokens.
5. Keep production publication manual and approval-gated.
6. Revoke any token that has been pasted into a chat, issue, commit, log, or other non-secret field.

## Required GitHub Environments

Create:

- `zenodo-sandbox`
- `zenodo-production`

Inside each environment, create this secret:

- `ZENODO_ACCESS_TOKEN`

Use a newly generated Zenodo Sandbox token in `zenodo-sandbox` and a separate newly generated production token in `zenodo-production`. Each token must support deposit modification and deposit actions.

Environment variables:

| Environment | Variable | Value |
| --- | --- | --- |
| `zenodo-sandbox` | `ZENODO_BASE_URL` | `https://sandbox.zenodo.org/api` |
| `zenodo-production` | `ZENODO_BASE_URL` | `https://zenodo.org/api` |

## Required repository variables

| Variable | Value |
| --- | --- |
| `ORCID_ID` | `0009-0005-8586-3650` |
| `ORCID_API_BASE` | `https://pub.orcid.org/v3.0` |
| `CROSSREF_API_BASE` | `https://api.crossref.org` |
| `CROSSREF_MAILTO` | `deonte.reprally@gmail.com` |
| `OPENAIRE_API_BASE` | `https://api.openaire.eu` |

## Environment bootstrap

The repository includes `scripts/configure-github-environments.sh`.

Authenticate GitHub CLI with repository-administration access, generate two new Zenodo tokens in their respective Zenodo accounts, then run:

```bash
export ZENODO_SANDBOX_TOKEN='new-sandbox-token'
export ZENODO_PRODUCTION_TOKEN='new-production-token'
export CROSSREF_MAILTO='deonte.reprally@gmail.com'
bash scripts/configure-github-environments.sh
```

The script creates both GitHub Environments, sets repository and environment variables, installs each token as an environment-scoped `ZENODO_ACCESS_TOKEN`, and lists only secret names afterward. It never prints token values.

## First Sandbox validation run

After the new Sandbox secret is installed:

1. Add one binary test file under `uploads/`.
2. Replace placeholder values in `metadata/research.json` with the validation record metadata.
3. Commit and push both changes together.
4. Open **Actions → Research Sync**.
5. Confirm the run selected `zenodo-sandbox`.
6. Download and inspect the `zenodo-result-<run-id>` artifact.
7. Confirm the result includes the Sandbox deposition ID, reserved DOI, draft URL, uploaded filename, byte size, SHA-256 value, and `published: false`.

## Local validation

```bash
node scripts/validate-metadata.mjs
node scripts/check-crossref.mjs "10.5281/zenodo.0000000"
```

## Production publication

Only after the Sandbox draft, metadata, rights, files, and checksums have been reviewed:

1. Open **Actions → Research Sync**.
2. Select **Run workflow**.
3. Set `publish_zenodo` to `true`.
4. Run the workflow from the intended release commit.
5. Approve the `zenodo-production` environment if protection rules require approval.
6. Review the resulting `zenodo-result-<run-id>` artifact and permanent Zenodo record.
