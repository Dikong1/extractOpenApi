# Contributing

## Development

Use Bun 1.3 and Node.js 22 or newer.

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
```

Run the CLI directly while developing:

```bash
bun run groups
bun bin/openapi-md.ts generate openapi.json --group "Access" --output -
```

## Agent skill

The distributable workflow lives in `.agents/skills/openapi-agent-reference/`. Keep its commands and option guidance synchronized with the CLI and README.

After changing the skill, confirm that the skills CLI discovers it:

```bash
npx skills add . --list
```

The skill is intentionally excluded from the npm tarball by the `files` allowlist in `package.json`. Continue to run `npm pack --dry-run` and verify that `.agents/` is absent from the publish file list.

## Pull requests

- Add or update tests for behavior changes.
- Keep the CLI backward compatible unless the change is intentionally released as a new major version.
- Update `README.md` and `CHANGELOG.md` for user-visible changes.
- Run `npm pack --dry-run` and inspect the publish file list before releasing.

## Releases

Use Semantic Versioning. Publishing is performed by the GitHub Actions release workflow through npm trusted publishing; do not add npm access tokens to the repository.
