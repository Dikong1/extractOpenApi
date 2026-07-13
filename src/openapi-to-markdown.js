#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function usage() {
  return `Usage: openapi-to-md [openapi.json] [options]

Options:
  -o, --output <file>       Output Markdown file (default: API_REFERENCE.md)
  --no-schema-catalog       Omit the reusable schema catalog
  --no-examples             Omit generated JSON examples
  --include-extensions      Include x-* operation extensions
  -h, --help                Show this help
`;
}

function parseArgs(argv) {
  const options = {
    input: 'openapi.json',
    output: 'API_REFERENCE.md',
    schemaCatalog: true,
    examples: true,
    includeExtensions: false,
  };
  let inputSet = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '--no-schema-catalog') options.schemaCatalog = false;
    else if (arg === '--no-examples') options.examples = false;
    else if (arg === '--include-extensions') options.includeExtensions = true;
    else if (arg === '-o' || arg === '--output') {
      if (!argv[index + 1]) throw new Error(`${arg} requires a file path`);
      options.output = argv[++index];
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!inputSet) {
      options.input = arg;
      inputSet = true;
    } else throw new Error(`Unexpected argument: ${arg}`);
  }
  return options;
}

function escapeTable(value) {
  return String(value ?? '—').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
}

function inlineCode(value) {
  if (value === undefined || value === null || value === '') return '—';
  const string = String(value);
  const fence = string.includes('`') ? '``' : '`';
  return `${fence}${string}${fence}`;
}

function anchor(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function localRefName(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.split('/');
  return decodeURIComponent(parts[parts.length - 1].replace(/~1/g, '/').replace(/~0/g, '~'));
}

function resolveLocalRef(spec, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
  return ref.slice(2).split('/').reduce((current, part) => {
    const key = decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'));
    return current && current[key];
  }, spec);
}

function schemaLink(ref) {
  const name = localRefName(ref);
  return name ? `[${inlineCode(name)}](#schema-${anchor(name)})` : inlineCode(ref);
}

function schemaType(schema) {
  if (!schema) return 'any';
  if (schema.$ref) return localRefName(schema.$ref) || schema.$ref;
  if (schema.const !== undefined) return typeof schema.const;
  if (schema.type) {
    const type = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
    if (type === 'array') return `array<${schemaType(schema.items)}>`;
    return schema.format ? `${type} (${schema.format})` : type;
  }
  if (schema.oneOf) return schema.oneOf.map(schemaType).join(' or ');
  if (schema.anyOf) return schema.anyOf.map(schemaType).join(' or ');
  if (schema.allOf) return schema.allOf.map(schemaType).join(' & ');
  if (schema.properties || schema.additionalProperties) return 'object';
  if (schema.enum) return typeof schema.enum[0];
  return 'any';
}

function schemaSummary(schema) {
  if (!schema) return 'any';
  if (schema.$ref) return schemaLink(schema.$ref);
  let summary = inlineCode(schemaType(schema));
  if (schema.enum) summary += ` enum: ${schema.enum.map(inlineCode).join(', ')}`;
  if (schema.default !== undefined) summary += `; default: ${inlineCode(JSON.stringify(schema.default))}`;
  if (schema.minimum !== undefined) summary += `; min: ${inlineCode(schema.minimum)}`;
  if (schema.maximum !== undefined) summary += `; max: ${inlineCode(schema.maximum)}`;
  if (schema.minLength !== undefined) summary += `; min length: ${inlineCode(schema.minLength)}`;
  if (schema.maxLength !== undefined) summary += `; max length: ${inlineCode(schema.maxLength)}`;
  if (schema.pattern) summary += `; pattern: ${inlineCode(schema.pattern)}`;
  return summary;
}

function firstExample(container) {
  if (!container) return undefined;
  if (container.example !== undefined) return container.example;
  if (container.examples) {
    const example = Object.values(container.examples)[0];
    if (example && typeof example === 'object' && 'value' in example) return example.value;
  }
  return undefined;
}

function sampleForSchema(schema, spec, state = { depth: 0, refs: new Set() }) {
  if (!schema || state.depth > 6) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.examples?.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.$ref) {
    if (state.refs.has(schema.$ref)) return `<recursive:${localRefName(schema.$ref) || schema.$ref}>`;
    const resolved = resolveLocalRef(spec, schema.$ref);
    if (!resolved) return `<${localRefName(schema.$ref) || schema.$ref}>`;
    const refs = new Set(state.refs);
    refs.add(schema.$ref);
    return sampleForSchema(resolved, spec, { depth: state.depth + 1, refs });
  }
  if (schema.allOf) {
    return schema.allOf.reduce((result, part) => {
      const value = sampleForSchema(part, spec, { ...state, depth: state.depth + 1 });
      return value && typeof value === 'object' && !Array.isArray(value) ? { ...result, ...value } : result;
    }, {});
  }
  if (schema.oneOf?.length) return sampleForSchema(schema.oneOf[0], spec, { ...state, depth: state.depth + 1 });
  if (schema.anyOf?.length) {
    const preferred = schema.anyOf.find((item) => item.type !== 'null') || schema.anyOf[0];
    return sampleForSchema(preferred, spec, { ...state, depth: state.depth + 1 });
  }
  const type = Array.isArray(schema.type) ? schema.type.find((item) => item !== 'null') : schema.type;
  if (type === 'object' || schema.properties || schema.additionalProperties) {
    const result = {};
    for (const [name, property] of Object.entries(schema.properties || {})) {
      if (property.readOnly) continue;
      result[name] = sampleForSchema(property, spec, { ...state, depth: state.depth + 1 });
    }
    if (!Object.keys(result).length && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      result.key = sampleForSchema(schema.additionalProperties, spec, { ...state, depth: state.depth + 1 });
    }
    return result;
  }
  if (type === 'array') return [sampleForSchema(schema.items || {}, spec, { ...state, depth: state.depth + 1 })];
  if (type === 'integer' || type === 'number') return schema.minimum ?? (schema.format === 'float' ? 1.5 : 1);
  if (type === 'boolean') return true;
  if (type === 'null') return null;
  if (schema.format === 'date-time') return '2026-01-15T12:00:00Z';
  if (schema.format === 'date') return '2026-01-15';
  if (schema.format === 'time') return '12:00:00Z';
  if (schema.format === 'email') return 'user@example.com';
  if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
  if (schema.format === 'uri' || schema.format === 'url') return 'https://example.com';
  if (schema.format === 'binary') return '<binary>';
  return 'string';
}

function jsonBlock(value) {
  let rendered;
  try { rendered = JSON.stringify(value, null, 2); } catch { rendered = 'null'; }
  return `\n\`\`\`json\n${rendered}\n\`\`\`\n`;
}

function mergeParameters(pathParameters = [], operationParameters = []) {
  const merged = new Map();
  for (const parameter of [...pathParameters, ...operationParameters]) {
    const key = parameter.$ref || `${parameter.in}:${parameter.name}`;
    merged.set(key, parameter);
  }
  return [...merged.values()];
}

function resolvedObject(spec, object) {
  return object?.$ref ? { ...resolveLocalRef(spec, object.$ref), ...object, $ref: object.$ref } : object;
}

function securityText(requirements, spec) {
  if (requirements === undefined) requirements = spec.security;
  if (requirements === undefined) return 'Not specified';
  if (requirements.length === 0) return 'None';
  return requirements.map((requirement) => {
    const entries = Object.entries(requirement);
    if (!entries.length) return 'Anonymous';
    return entries.map(([name, scopes]) => scopes?.length ? `${name} (${scopes.join(', ')})` : name).join(' AND ');
  }).join(' OR ');
}

function renderSecurity(spec) {
  const schemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
  if (!Object.keys(schemes).length && !spec.security) return '';
  const lines = ['## Authentication', ''];
  if (spec.security !== undefined) lines.push(`Global requirement: **${securityText(spec.security, spec)}**`, '');
  for (const [name, scheme] of Object.entries(schemes)) {
    lines.push(`### ${name}`, '', `- Type: ${inlineCode(scheme.type)}`);
    if (scheme.description) lines.push(`- Description: ${scheme.description}`);
    if (scheme.in) lines.push(`- Send in: ${inlineCode(scheme.in)}`);
    if (scheme.name) lines.push(`- Parameter name: ${inlineCode(scheme.name)}`);
    if (scheme.scheme) lines.push(`- HTTP scheme: ${inlineCode(scheme.scheme)}`);
    if (scheme.bearerFormat) lines.push(`- Bearer format: ${inlineCode(scheme.bearerFormat)}`);
    if (scheme.openIdConnectUrl) lines.push(`- OpenID Connect URL: ${scheme.openIdConnectUrl}`);
    if (scheme.flow) {
      lines.push(`- OAuth flow: ${inlineCode(scheme.flow)}`);
      if (scheme.authorizationUrl) lines.push(`- Authorization URL: ${scheme.authorizationUrl}`);
      if (scheme.tokenUrl) lines.push(`- Token URL: ${scheme.tokenUrl}`);
    }
    for (const [flowName, flow] of Object.entries(scheme.flows || {})) {
      lines.push(`- OAuth flow ${inlineCode(flowName)}: token ${flow.tokenUrl || '—'}${flow.authorizationUrl ? `; authorize ${flow.authorizationUrl}` : ''}`);
      const scopes = Object.entries(flow.scopes || {});
      if (scopes.length) lines.push(`  - Scopes: ${scopes.map(([scope, description]) => `${inlineCode(scope)} — ${description}`).join('; ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function serverUrls(spec) {
  if (spec.servers?.length) return spec.servers.map((server) => ({ url: server.url, description: server.description }));
  if (spec.swagger) {
    const schemes = spec.schemes?.length ? spec.schemes : ['https'];
    return schemes.map((scheme) => ({ url: `${scheme}://${spec.host || '<host>'}${spec.basePath || ''}` }));
  }
  return [];
}

function collectOperations(spec) {
  const groups = new Map();
  for (const [route, rawPathItem] of Object.entries(spec.paths || {})) {
    const pathItem = resolvedObject(spec, rawPathItem) || rawPathItem;
    for (const [method, rawOperation] of Object.entries(pathItem || {})) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      const operation = resolvedObject(spec, rawOperation);
      const group = operation.tags?.[0] || 'Untagged';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ route, method: method.toUpperCase(), operation, pathItem });
    }
  }
  const declaredOrder = (spec.tags || []).map((tag) => tag.name);
  return [...groups.entries()].sort(([a], [b]) => {
    const ai = declaredOrder.indexOf(a);
    const bi = declaredOrder.indexOf(b);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    return a.localeCompare(b);
  });
}

function renderParameters(parameters, spec) {
  if (!parameters.length) return '';
  const lines = ['#### Parameters', '', '| Name | In | Required | Type | Description / constraints |', '|---|---|:---:|---|---|'];
  for (const rawParameter of parameters) {
    const parameter = resolvedObject(spec, rawParameter) || rawParameter;
    const schema = parameter.schema || (parameter.type ? parameter : {});
    const details = [parameter.description, parameter.deprecated ? '**Deprecated.**' : '', parameter.allowEmptyValue ? 'Empty value allowed.' : ''].filter(Boolean).join(' ');
    lines.push(`| ${inlineCode(parameter.name || localRefName(rawParameter.$ref))} | ${inlineCode(parameter.in)} | ${parameter.required ? 'yes' : 'no'} | ${escapeTable(schemaSummary(schema))} | ${escapeTable(details || '—')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderContent(content, spec, options, headingLevel = 5) {
  const lines = [];
  for (const [mediaType, media] of Object.entries(content || {})) {
    lines.push(`${'#'.repeat(headingLevel)} ${mediaType}`, '');
    if (media.schema) lines.push(`Schema: ${schemaSummary(media.schema)}`, '');
    const example = firstExample(media);
    if (options.examples && (example !== undefined || media.schema)) {
      lines.push('Example:', jsonBlock(example !== undefined ? example : sampleForSchema(media.schema, spec)));
    }
    if (media.encoding && Object.keys(media.encoding).length) {
      lines.push('Encoding:', '', '| Property | Content type | Style | Explode |', '|---|---|---|---|');
      for (const [property, encoding] of Object.entries(media.encoding)) {
        lines.push(`| ${inlineCode(property)} | ${inlineCode(encoding.contentType)} | ${inlineCode(encoding.style)} | ${encoding.explode ?? '—'} |`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function swaggerRequestContent(parameters) {
  const body = parameters.find((parameter) => parameter.in === 'body');
  if (body) return { 'application/json': { schema: body.schema, example: body.example } };
  const form = parameters.filter((parameter) => parameter.in === 'formData');
  if (form.length) {
    return { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: Object.fromEntries(form.map((p) => [p.name, p])), required: form.filter((p) => p.required).map((p) => p.name) } } };
  }
  return {};
}

function renderRequest(operation, parameters, spec, options) {
  const rawBody = operation.requestBody ? resolvedObject(spec, operation.requestBody) : null;
  const content = rawBody?.content || swaggerRequestContent(parameters);
  if (!Object.keys(content).length) return '';
  const lines = ['#### Request body', ''];
  if (rawBody?.description) lines.push(rawBody.description, '');
  if (rawBody) lines.push(`Required: **${rawBody.required ? 'yes' : 'no'}**`, '');
  lines.push(renderContent(content, spec, options));
  return lines.join('\n');
}

function renderHeaders(headers, spec) {
  if (!headers || !Object.keys(headers).length) return '';
  const lines = ['Headers:', '', '| Name | Type | Description |', '|---|---|---|'];
  for (const [name, rawHeader] of Object.entries(headers)) {
    const header = resolvedObject(spec, rawHeader) || rawHeader;
    lines.push(`| ${inlineCode(name)} | ${escapeTable(schemaSummary(header.schema || header))} | ${escapeTable(header.description || '—')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderResponses(operation, spec, options) {
  const lines = ['#### Responses', ''];
  const responses = operation.responses || {};
  if (!Object.keys(responses).length) return [...lines, '_No responses documented._', ''].join('\n');
  for (const [status, rawResponse] of Object.entries(responses)) {
    const response = resolvedObject(spec, rawResponse) || rawResponse;
    lines.push(`##### ${status} — ${response.description || 'Response'}`, '');
    const headers = renderHeaders(response.headers, spec);
    if (headers) lines.push(headers);
    let content = response.content;
    if (!content && response.schema) content = { 'application/json': { schema: response.schema, examples: response.examples } };
    if (content) lines.push(renderContent(content, spec, options, 6));
    if (response.links && Object.keys(response.links).length) {
      lines.push('Links:', '');
      for (const [name, link] of Object.entries(response.links)) lines.push(`- **${name}:** ${link.operationId || link.operationRef || ''} ${link.description || ''}`.trim());
      lines.push('');
    }
  }
  return lines.join('\n');
}

function renderExtensions(operation) {
  const extensions = Object.entries(operation).filter(([key]) => key.startsWith('x-'));
  if (!extensions.length) return '';
  return ['#### Extensions', '', ...extensions.map(([key, value]) => `- ${inlineCode(key)}: ${inlineCode(JSON.stringify(value))}`), ''].join('\n');
}

function renderOperation(item, spec, options) {
  const { route, method, operation, pathItem } = item;
  const title = operation.summary || operation.operationId || `${method} ${route}`;
  const parameters = mergeParameters(pathItem.parameters, operation.parameters).map((parameter) => resolvedObject(spec, parameter) || parameter);
  const nonBodyParameters = parameters.filter((parameter) => !['body', 'formData'].includes(parameter.in));
  const lines = [
    `### ${method} ${route}`,
    '',
    `**${title}**`,
    '',
  ];
  if (operation.description && operation.description !== operation.summary) lines.push(operation.description, '');
  const metadata = [];
  if (operation.operationId) metadata.push(`- Operation ID: ${inlineCode(operation.operationId)}`);
  metadata.push(`- Authentication: **${securityText(operation.security, spec)}**`);
  if (operation.deprecated) metadata.push('- Status: **Deprecated**');
  if (operation.externalDocs?.url) metadata.push(`- External docs: [${operation.externalDocs.description || operation.externalDocs.url}](${operation.externalDocs.url})`);
  if (operation.tags?.length > 1) metadata.push(`- Additional tags: ${operation.tags.slice(1).map(inlineCode).join(', ')}`);
  lines.push(...metadata, '');
  const parameterSection = renderParameters(nonBodyParameters, spec);
  if (parameterSection) lines.push(parameterSection);
  const requestSection = renderRequest(operation, parameters, spec, options);
  if (requestSection) lines.push(requestSection);
  lines.push(renderResponses(operation, spec, options));
  if (options.includeExtensions) {
    const extensions = renderExtensions(operation);
    if (extensions) lines.push(extensions);
  }
  return lines.join('\n');
}

function flattenSchemaProperties(schema, spec) {
  const properties = { ...(schema.properties || {}) };
  const required = new Set(schema.required || []);
  for (const part of schema.allOf || []) {
    const resolved = part.$ref ? resolveLocalRef(spec, part.$ref) : part;
    if (!resolved) continue;
    Object.assign(properties, resolved.properties || {});
    for (const name of resolved.required || []) required.add(name);
  }
  return { properties, required };
}

function renderSchema(name, schema, spec, options) {
  const lines = [`<a id="schema-${anchor(name)}"></a>`, '', `### ${name}`, ''];
  if (schema.description) lines.push(schema.description, '');
  lines.push(`Type: ${schemaSummary(schema)}`, '');
  if (schema.deprecated) lines.push('**Deprecated.**', '');
  const { properties, required } = flattenSchemaProperties(schema, spec);
  if (Object.keys(properties).length) {
    lines.push('| Property | Required | Type | Description / constraints |', '|---|:---:|---|---|');
    for (const [propertyName, property] of Object.entries(properties)) {
      const details = [property.description, property.readOnly ? 'Read-only.' : '', property.writeOnly ? 'Write-only.' : '', property.deprecated ? 'Deprecated.' : ''].filter(Boolean).join(' ');
      lines.push(`| ${inlineCode(propertyName)} | ${required.has(propertyName) ? 'yes' : 'no'} | ${escapeTable(schemaSummary(property))} | ${escapeTable(details || '—')} |`);
    }
    lines.push('');
  }
  if (schema.discriminator) lines.push(`Discriminator: ${inlineCode(schema.discriminator.propertyName)}`, '');
  if (options.examples) lines.push('Example:', jsonBlock(sampleForSchema(schema, spec)));
  return lines.join('\n');
}

function renderSchemas(spec, options) {
  const schemas = spec.components?.schemas || spec.definitions || {};
  if (!options.schemaCatalog || !Object.keys(schemas).length) return '';
  const lines = ['## Schema catalog', '', `${Object.keys(schemas).length} reusable schema(s).`, ''];
  for (const [name, schema] of Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(renderSchema(name, schema, spec, options));
  }
  return lines.join('\n');
}

function generateMarkdown(spec, options = {}) {
  options = { schemaCatalog: true, examples: true, includeExtensions: false, ...options };
  if (!spec || typeof spec !== 'object') throw new Error('The OpenAPI document must be a JSON object');
  if (!spec.openapi && !spec.swagger) throw new Error('Missing required "openapi" or "swagger" version field');
  if (!spec.paths || typeof spec.paths !== 'object') throw new Error('Missing required "paths" object');

  const title = spec.info?.title || 'API Reference';
  const groups = collectOperations(spec);
  const operationCount = groups.reduce((count, [, operations]) => count + operations.length, 0);
  const lines = [
    `# ${title} API Reference`,
    '',
    '> Generated from the OpenAPI document. Optimized for human readers and AI agents: use operation IDs for tool names, honor required parameters, and validate request/response bodies against the linked schemas.',
    '',
    `- API version: ${inlineCode(spec.info?.version || 'unspecified')}`,
    `- OpenAPI version: ${inlineCode(spec.openapi || spec.swagger)}`,
    `- Operations: **${operationCount}** across **${groups.length}** group(s)`,
  ];
  if (spec.info?.description) lines.push('', spec.info.description);
  if (spec.info?.termsOfService) lines.push(`- Terms of service: ${spec.info.termsOfService}`);
  if (spec.info?.contact?.url || spec.info?.contact?.email) lines.push(`- Contact: ${spec.info.contact.url || spec.info.contact.email}`);
  if (spec.externalDocs?.url) lines.push(`- External documentation: [${spec.externalDocs.description || spec.externalDocs.url}](${spec.externalDocs.url})`);

  const servers = serverUrls(spec);
  lines.push('', '## Base URLs', '');
  if (servers.length) {
    for (const server of servers) lines.push(`- ${inlineCode(server.url)}${server.description ? ` — ${server.description}` : ''}`);
  } else lines.push('_No server URL is declared. Supply the deployment base URL at runtime._');
  lines.push('');

  const security = renderSecurity(spec);
  if (security) lines.push(security);

  lines.push('## Endpoint index', '');
  for (const [group, operations] of groups) {
    lines.push(`- [${group}](#group-${anchor(group)}) (${operations.length})`);
    for (const item of operations) lines.push(`  - [${item.method} ${item.route}](#${anchor(`${item.method} ${item.route}`)})`);
  }
  lines.push('');

  const declaredTags = new Map((spec.tags || []).map((tag) => [tag.name, tag]));
  for (const [group, operations] of groups) {
    lines.push(`<a id="group-${anchor(group)}"></a>`, '', `## ${group}`, '');
    const tag = declaredTags.get(group);
    if (tag?.description) lines.push(tag.description, '');
    if (tag?.externalDocs?.url) lines.push(`[Group documentation](${tag.externalDocs.url})`, '');
    for (const item of operations) lines.push(renderOperation(item, spec, options));
  }

  const schemas = renderSchemas(spec, options);
  if (schemas) lines.push(schemas);
  lines.push('---', '', '_Generated by openapi-agent-reference. Do not edit manually; regenerate after the OpenAPI document changes._', '');
  return lines.join('\n').replace(/\n{4,}/g, '\n\n\n');
}

function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`Error: ${error.message}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  try {
    const inputPath = path.resolve(options.input);
    const outputPath = path.resolve(options.output);
    const source = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
    let spec;
    try { spec = JSON.parse(source); } catch (error) { throw new Error(`Invalid JSON in ${inputPath}: ${error.message}`); }
    const markdown = generateMarkdown(spec, options);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, markdown, 'utf8');
    const operations = collectOperations(spec).reduce((count, [, items]) => count + items.length, 0);
    console.log(`Generated ${outputPath} (${operations} operations, ${Buffer.byteLength(markdown)} bytes)`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { generateMarkdown, parseArgs, sampleForSchema, collectOperations };
