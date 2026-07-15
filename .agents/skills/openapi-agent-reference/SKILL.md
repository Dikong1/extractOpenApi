---
name: openapi-agent-reference
description: Generate compact, navigable Markdown API references from OpenAPI or Swagger JSON documents with openapi-agent-reference. Use when an agent needs to inspect available API groups, document a complete API or one exact tag group, create agent-friendly endpoint and schema documentation, pipe an OpenAPI document through stdin or stdout, or regenerate Markdown after an OpenAPI JSON specification changes. Do not use for OpenAPI YAML unless it has first been converted to JSON.
---

# OpenAPI Agent Reference

Generate Markdown through the package CLI. Treat the OpenAPI document as the source of truth and regenerate output instead of manually editing generated sections.

## Choose the command

Use the repository executable when working in the `openapi-agent-reference` source repository:

```bash
node bin/openapi-md.js <command> [arguments]
```

Otherwise, use the published package without modifying the target project's dependencies:

```bash
npx --yes openapi-agent-reference@latest <command> [arguments]
```

If the target project already installs the package, prefer its local `openapi-md` executable through the project's established npm script or package runner.

## Generate a reference

1. Locate the requested OpenAPI document. Require JSON input containing `openapi` or `swagger` and a `paths` object. Ask for or perform an explicit YAML-to-JSON conversion before continuing with YAML input.
2. Decide whether the user wants the complete API or a focused group. If scope is ambiguous and the document has many operations, list groups first instead of guessing.
3. For focused output, discover exact, case-sensitive group names:

   ```bash
   npx --yes openapi-agent-reference@latest groups openapi.json
   ```

   Use `--json` when machine-readable group data helps further processing.
4. Generate to an explicit output path:

   ```bash
   npx --yes openapi-agent-reference@latest generate openapi.json --output API_REFERENCE.md
   npx --yes openapi-agent-reference@latest generate openapi.json --group "Equipment Service" --output EQUIPMENT_SERVICE.md
   ```

5. Check the exit status and diagnostic output. On an unknown group, use the suggested or listed exact name and rerun only when it matches the user's intended scope.
6. Verify that the Markdown title, operation count, group headings, endpoints, and linked schemas match the requested scope. Confirm that focused output excludes unrelated groups.

## Work with standard streams

Use `-` in the input position to read one complete OpenAPI JSON document from stdin. Use `--output -` to write generated Markdown to stdout.

List groups from a remote document without creating an input file:

```bash
curl -fsS https://example.com/openapi.json | npx --yes openapi-agent-reference@latest groups - --json
```

Generate a focused reference from stdin and write Markdown to stdout:

```bash
curl -fsS https://example.com/openapi.json | npx --yes openapi-agent-reference@latest generate - --group "Users" --output -
```

Redirect only the generated Markdown to a file:

```bash
curl -fsS https://example.com/openapi.json | npx --yes openapi-agent-reference@latest generate - --output - > API_REFERENCE.md
```

Use an existing local file as stdin when a pipeline is more convenient:

```powershell
Get-Content -Raw openapi.json | npx --yes openapi-agent-reference@latest generate - --output -
```

Apply these stream rules:

- Treat stdout as data: group text, group JSON, or generated Markdown depending on the command and options.
- Treat stderr as diagnostics. Do not merge stderr into stdout when piping or parsing results.
- Consume stdout only after checking for a successful exit status. Invalid JSON and generation errors are reported on stderr.
- Remember that stdin is consumed once. To list groups and then generate from the same remote document, download or buffer it once, or repeat the upstream request deliberately.
- Validate remote responses before treating them as OpenAPI input. Do not pass an HTTP error page or authentication response to the generator.
- Prefer stdin/stdout when the caller already holds the document in memory or a downstream process will consume the Markdown; prefer explicit file paths when the result is a persistent artifact.

## Select options deliberately

- Use `--no-schema-catalog` only when reusable schema documentation is unwanted.
- Use `--no-examples` when examples would be noisy, sensitive, or unnecessarily large.
- Use `--include-extensions` when operation-level `x-*` metadata is relevant.
- Preserve external `$ref` URLs as references; do not imply that this package downloads or resolves them.

For automation, prefer explicit input, group, and output arguments. Do not rely on the defaults `openapi.json` and `API_REFERENCE.md` unless those paths are intentional.

## Preserve existing files and workflows

Before overwriting an existing file, confirm it is generated output or that replacement was requested. A generated reference ends with the `Generated by openapi-agent-reference` notice. Do not edit `package.json`, install dependencies, or change application code merely to run the CLI.

When working in this package's source repository, run `npm test` after implementation changes. Run `npm pack --dry-run` when changing package metadata or release contents.
