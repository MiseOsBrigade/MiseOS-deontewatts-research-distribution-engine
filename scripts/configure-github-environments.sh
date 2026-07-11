#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-MiseOsBrigade/MiseOS-deontewatts-research-distribution-engine}"
CROSSREF_MAILTO="${CROSSREF_MAILTO:-deonte.reprally@gmail.com}"

command -v gh >/dev/null 2>&1 || {
  echo "GitHub CLI (gh) is required." >&2
  exit 1
}

gh auth status >/dev/null

: "${ZENODO_SANDBOX_TOKEN:?Export a newly generated Zenodo Sandbox token as ZENODO_SANDBOX_TOKEN.}"
: "${ZENODO_PRODUCTION_TOKEN:?Export a separate newly generated Zenodo production token as ZENODO_PRODUCTION_TOKEN.}"

# Create or update the two deployment environments.
gh api --method PUT "repos/${REPO}/environments/zenodo-sandbox" >/dev/null
gh api --method PUT "repos/${REPO}/environments/zenodo-production" >/dev/null

# Public repository-level variables.
gh variable set ORCID_ID --repo "$REPO" --body "0009-0005-8586-3650"
gh variable set ORCID_API_BASE --repo "$REPO" --body "https://pub.orcid.org/v3.0"
gh variable set CROSSREF_API_BASE --repo "$REPO" --body "https://api.crossref.org"
gh variable set CROSSREF_MAILTO --repo "$REPO" --body "$CROSSREF_MAILTO"
gh variable set OPENAIRE_API_BASE --repo "$REPO" --body "https://api.openaire.eu"

# Environment-specific API endpoints.
gh variable set ZENODO_BASE_URL --repo "$REPO" --env zenodo-sandbox --body "https://sandbox.zenodo.org/api"
gh variable set ZENODO_BASE_URL --repo "$REPO" --env zenodo-production --body "https://zenodo.org/api"

# Environment-scoped secrets. Values are passed through stdin and never printed.
printf '%s' "$ZENODO_SANDBOX_TOKEN" |
  gh secret set ZENODO_ACCESS_TOKEN --repo "$REPO" --env zenodo-sandbox
printf '%s' "$ZENODO_PRODUCTION_TOKEN" |
  gh secret set ZENODO_ACCESS_TOKEN --repo "$REPO" --env zenodo-production

unset ZENODO_SANDBOX_TOKEN ZENODO_PRODUCTION_TOKEN

echo "Configured repository variables:"
gh variable list --repo "$REPO"

echo "Configured zenodo-sandbox variables and secret names:"
gh variable list --repo "$REPO" --env zenodo-sandbox
gh secret list --repo "$REPO" --env zenodo-sandbox

echo "Configured zenodo-production variables and secret names:"
gh variable list --repo "$REPO" --env zenodo-production
gh secret list --repo "$REPO" --env zenodo-production

echo "Zenodo environments are ready. Token values were not displayed."
