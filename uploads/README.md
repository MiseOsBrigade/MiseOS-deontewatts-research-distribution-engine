# Research Upload Queue

Place the files for one research release in this directory.

Supported examples:

- PDF manuscripts
- CSV or JSON datasets
- ZIP source archives
- Figures and supplementary files
- Markdown or plain-text reports

A push affecting `uploads/**` or `metadata/research.json` automatically runs the Research Sync workflow against Zenodo Sandbox. It does not permanently publish a production DOI.

Before adding files:

1. Update `metadata/research.json`.
2. Confirm authors, ORCID identifiers, title, abstract, license, and publication date.
3. Remove credentials, private records, and material you do not have permission to distribute.
4. Add the research files.
5. Review the Zenodo Sandbox draft and workflow artifact.
6. Run the workflow manually with `publish_zenodo=true` only after approval.

Do not store API tokens, passwords, OAuth secrets, private keys, or sensitive personal information here.
