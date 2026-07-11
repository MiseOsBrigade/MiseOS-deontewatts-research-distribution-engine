# Research Upload Console

Production-ready Next.js intake service for the Research Distribution Engine.

## What it does

1. Authenticates the uploader with a server-side intake key.
2. Validates origin, rate, file size, extension, MIME type, and ORCID format.
3. Creates Git blobs for the binary file and matching metadata.
4. Commits both paths atomically to the target repository.
5. Pushes the commit to `main`, triggering the existing Research Sync workflow.
6. GitHub Actions validates the metadata and transfers the file to Zenodo.

## Required server variables

```bash
GITHUB_TOKEN=
GITHUB_REPOSITORY=MiseOsBrigade/MiseOS-deontewatts-research-distribution-engine
GITHUB_BRANCH=main
UPLOAD_PATH_PREFIX=uploads
UPLOAD_API_KEY=
ALLOWED_ORIGINS=http://localhost:3000
MAX_UPLOAD_BYTES=25000000
UPLOAD_RATE_LIMIT=10
UPLOAD_RATE_WINDOW_MS=60000
```

Never prefix secrets with `NEXT_PUBLIC_`.

## Local validation

```bash
npm install
npm run typecheck
npm run build
npm start
```

Health endpoint: `GET /api/health`

Upload endpoint: `POST /api/upload` using multipart form data and `Authorization: Bearer <UPLOAD_API_KEY>`.
