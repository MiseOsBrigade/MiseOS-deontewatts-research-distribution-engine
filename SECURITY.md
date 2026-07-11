# Security

## Credential handling

- Do not commit access tokens, OAuth client secrets, passwords, or private keys.
- Use GitHub Actions Secrets for sensitive values.
- Rotate any credential that has been pasted into chat, logs, issues, commits, or documentation.
- Use separate Zenodo Sandbox and production tokens.
- Require a protected GitHub Environment approval before permanent Zenodo publishing.
- Prefer short-lived OAuth credentials where supported.

## Required rotation

Previously exposed GitHub, Zenodo, or ORCID credentials must not be reused.
