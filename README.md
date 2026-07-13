# OpenAPI Agent Reference

Generate compact, navigable Markdown API references from OpenAPI JSON. The output is designed for developers and AI agents and includes authentication, parameters, request and response bodies, examples, and reusable schemas.

## Requirements

Node.js 22 or newer. The package has no runtime dependencies.

## Quick start

Run the published package without installing it:

```bash
npx openapi-agent-reference@latest groups openapi.json
npx openapi-agent-reference@latest generate openapi.json --group "Equipment Service" -o EQUIPMENT_SERVICE.md
```

Or install it in a project:

```bash
npm install --save-dev openapi-agent-reference
```

The short command is then available through `npx` and npm scripts:

```bash
npx openapi-md groups openapi.json
npx openapi-md generate openapi.json -o API_REFERENCE.md
```

## CLI

### Discover groups

Groups are primary OpenAPI operation tags. List their exact, case-sensitive names before generating a focused reference:

```bash
openapi-md groups openapi.json
```

Example output:

```text
GROUP                     OPERATIONS
------------------------  ----------
Access                    9
Equipment Service         49
```

For machine-readable output:

```bash
openapi-md groups openapi.json --json
```

```json
[
  { "name": "Access", "operations": 9 },
  { "name": "Equipment Service", "operations": 49 }
]
```

### Generate one group

```bash
openapi-md generate openapi.json --group "Access" --output ACCESS.md
```

The result contains only the selected group's endpoints and the reusable schemas they reference, including transitive schema dependencies. A misspelled group produces a close-match suggestion and the complete list of valid groups.

### Generate the complete reference

```bash
openapi-md generate openapi.json --output API_REFERENCE.md
```

### Pipelines and standard streams

Use `-` for standard input or standard output:

```bash
curl https://example.com/openapi.json | openapi-md groups - --json
openapi-md generate openapi.json --group Users --output -
```

Diagnostics are written to stderr, so Markdown and JSON output can be piped safely.

### Options

```text
-o, --output <file|->     Output file, or - for stdout
-g, --group <name>        Generate only the exact, case-sensitive group
--json                    JSON output for the groups command
--no-schema-catalog       Omit reusable schemas
--no-examples             Omit generated JSON examples
--include-extensions      Include x-* operation extensions
-v, --version             Show the installed version
-h, --help                Show CLI help
```

The original flag-based syntax remains available for backward compatibility:

```bash
openapi-md openapi.json --list-groups
openapi-md openapi.json --group Access -o ACCESS.md
```

## Programmatic API

The CommonJS entry point exposes the generator and OpenAPI inspection helpers:

```js
const fs = require('node:fs');
const {
  generateMarkdown,
  groupList,
} = require('openapi-agent-reference');

const spec = JSON.parse(fs.readFileSync('openapi.json', 'utf8'));

console.log(groupList(spec));

const markdown = generateMarkdown(spec, {
  group: 'Access',
  examples: true,
  schemaCatalog: true,
});
```

Public exports:

- `generateMarkdown(spec, options)`
- `groupList(spec)`
- `collectOperations(spec)`
- `formatGroupList(spec)`
- `referencedSchemaNames(groups, spec)`
- `sampleForSchema(schema, spec)`

## Generated reference content

- Endpoints grouped by their primary OpenAPI tag
- Operation IDs, descriptions, authentication, and deprecation state
- Path, query, header, and cookie parameters with constraints
- Request and response bodies for every documented media type
- Explicit and schema-generated JSON examples
- Response headers and OpenAPI links
- OAuth, bearer, API-key, and other security scheme details
- Linked reusable schemas with required fields and recursive-reference protection
- OpenAPI 3.x support and practical Swagger 2.0 compatibility

Local `$ref` values are resolved and linked. External `$ref` URLs are preserved but are not downloaded.

## Development and releases

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and release guidance. Changes are recorded in [CHANGELOG.md](CHANGELOG.md).

Publishing uses npm trusted publishing from GitHub Actions. Before the first automated release, configure `npm-publish.yml` as the trusted publisher in the package settings on npmjs.com.

## License

MIT
