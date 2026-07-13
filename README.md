# OpenAPI Agent Reference Generator

A zero-runtime-dependency Node.js CLI that turns an OpenAPI JSON document into a single navigable Markdown API reference. The output is designed for both developers and AI agents.

It includes:

- endpoints grouped by their primary OpenAPI tag;
- operation IDs, authentication requirements, deprecation status, and descriptions;
- path, query, header, and cookie parameters with constraints;
- request bodies and response bodies for every documented media type;
- explicit and schema-generated JSON examples;
- response headers and OpenAPI links;
- OAuth, bearer, API-key, and other security scheme details;
- a reusable schema catalog with required fields and `$ref` links;
- OpenAPI 3.x support plus practical Swagger 2.0 compatibility.

## Requirements

Node.js 18 or newer. No package installation is required.

## Usage

```bash
node src/openapi-to-markdown.js openapi.json -o API_REFERENCE.md
```

Or use the included npm script for the default paths:

```bash
npm run generate
```

Options:

```text
-o, --output <file>    Output file (default: API_REFERENCE.md)
--no-schema-catalog    Omit reusable schemas
--no-examples          Omit generated JSON examples
--include-extensions   Include x-* operation extensions
-h, --help             Show CLI help
```

The generator never calls the API and does not resolve external `$ref` URLs. Local component references such as `#/components/schemas/User` are linked to the schema catalog.
