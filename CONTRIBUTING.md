# Contributing

## Development

Use Node.js 22 or newer.

```bash
npm ci
npm test
```

Run the CLI directly while developing:

```bash
node bin/openapi-md.js groups openapi.json
node bin/openapi-md.js generate openapi.json --group "Access" --output -
```

## Pull requests

- Add or update tests for behavior changes.
- Keep the CLI backward compatible unless the change is intentionally released as a new major version.
- Update `README.md` and `CHANGELOG.md` for user-visible changes.
- Run `npm pack --dry-run` and inspect the publish file list before releasing.

## Releases

Use Semantic Versioning. Publishing is performed by the GitHub Actions release workflow through npm trusted publishing; do not add npm access tokens to the repository.
