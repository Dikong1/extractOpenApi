type SecurityRequirement = Record<string, string[]>;

interface ExternalDocumentation {
  description?: string;
  url: string;
}

export interface OpenApiObject {
  [key: string]: unknown;
  $ref?: string;
  additionalProperties?: boolean | OpenApiObject;
  allOf?: OpenApiObject[];
  allowEmptyValue?: boolean;
  anyOf?: OpenApiObject[];
  authorizationUrl?: string;
  bearerFormat?: string;
  const?: unknown;
  content?: Record<string, OpenApiObject>;
  contentType?: string;
  default?: unknown;
  deprecated?: boolean;
  description?: string;
  discriminator?: { propertyName: string };
  encoding?: Record<string, OpenApiObject>;
  enum?: unknown[];
  example?: unknown;
  examples?: unknown[] | Record<string, OpenApiObject>;
  explode?: boolean;
  externalDocs?: ExternalDocumentation;
  flow?: string;
  flows?: Record<string, OpenApiObject>;
  format?: string;
  headers?: Record<string, OpenApiObject>;
  in?: string;
  items?: OpenApiObject;
  links?: Record<string, OpenApiObject>;
  maximum?: number;
  maxLength?: number;
  minimum?: number;
  minLength?: number;
  name?: string;
  oneOf?: OpenApiObject[];
  openIdConnectUrl?: string;
  operationId?: string;
  operationRef?: string;
  parameters?: OpenApiObject[];
  pattern?: string;
  properties?: Record<string, OpenApiObject>;
  readOnly?: boolean;
  requestBody?: OpenApiObject;
  required?: boolean | string[];
  responses?: Record<string, OpenApiObject>;
  schema?: OpenApiObject;
  scheme?: string;
  scopes?: Record<string, string>;
  security?: SecurityRequirement[];
  style?: string;
  summary?: string;
  tags?: string[];
  tokenUrl?: string;
  type?: string | string[];
  value?: unknown;
  writeOnly?: boolean;
}

interface OpenApiInfo {
  contact?: { email?: string; url?: string };
  description?: string;
  termsOfService?: string;
  title?: string;
  version?: string;
}

interface OpenApiTag {
  description?: string;
  externalDocs?: ExternalDocumentation;
  name: string;
}

export interface OpenApiDocument {
  [key: string]: unknown;
  basePath?: string;
  components?: {
    schemas?: Record<string, OpenApiObject>;
    securitySchemes?: Record<string, OpenApiObject>;
  };
  definitions?: Record<string, OpenApiObject>;
  externalDocs?: ExternalDocumentation;
  host?: string;
  info?: OpenApiInfo;
  openapi?: string;
  paths: Record<string, OpenApiObject>;
  schemes?: string[];
  security?: SecurityRequirement[];
  securityDefinitions?: Record<string, OpenApiObject>;
  servers?: Array<{ description?: string; url: string }>;
  swagger?: string;
  tags?: OpenApiTag[];
}

export interface GenerateOptions {
  examples?: boolean;
  group?: string;
  includeExtensions?: boolean;
  schemaCatalog?: boolean;
}

export interface OperationItem {
  method: string;
  operation: OpenApiObject;
  pathItem: OpenApiObject;
  route: string;
}

export type OperationGroup = [name: string, operations: OperationItem[]];

interface SampleState {
  depth: number;
  refs: Set<string>;
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeTable(value: unknown): string {
  return String(value ?? '—').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
}

function inlineCode(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  const string = String(value);
  const fence = string.includes('`') ? '``' : '`';
  return `${fence}${string}${fence}`;
}

function anchor(value: unknown): string {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function localRefName(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const parts = ref.split('/');
  const name = parts.at(-1);
  return name ? decodeURIComponent(name.replace(/~1/g, '/').replace(/~0/g, '~')) : null;
}

function resolveLocalRef(spec: OpenApiDocument, ref: unknown): OpenApiObject | undefined {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
  const resolved = ref.slice(2).split('/').reduce<unknown>((current, part) => {
    const key = decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'));
    return isObject(current) ? current[key] : undefined;
  }, spec);
  return isObject(resolved) ? resolved as OpenApiObject : undefined;
}

function schemaLink(ref: unknown): string {
  const name = localRefName(ref);
  return name ? `[${inlineCode(name)}](#schema-${anchor(name)})` : inlineCode(ref);
}

function schemaType(schema: OpenApiObject | undefined): string {
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

function schemaSummary(schema: OpenApiObject | undefined): string {
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

function firstExample(container: OpenApiObject | undefined): unknown {
  if (!container) return undefined;
  if (container.example !== undefined) return container.example;
  if (container.examples) {
    const example = Object.values(container.examples)[0];
    if (isObject(example) && 'value' in example) return example.value;
  }
  return undefined;
}

export function sampleForSchema(
  schema: OpenApiObject | undefined,
  spec: OpenApiDocument,
  state: SampleState = { depth: 0, refs: new Set<string>() },
): unknown {
  if (!schema || state.depth > 6) return null;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
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
    const result: Record<string, unknown> = {};
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

function jsonBlock(value: unknown): string {
  let rendered;
  try { rendered = JSON.stringify(value, null, 2); } catch { rendered = 'null'; }
  return `\n\`\`\`json\n${rendered}\n\`\`\`\n`;
}

function mergeParameters(
  pathParameters: OpenApiObject[] = [],
  operationParameters: OpenApiObject[] = [],
): OpenApiObject[] {
  const merged = new Map<string, OpenApiObject>();
  for (const parameter of [...pathParameters, ...operationParameters]) {
    const key = parameter.$ref || `${parameter.in}:${parameter.name}`;
    merged.set(key, parameter);
  }
  return [...merged.values()];
}

function resolvedObject<T extends OpenApiObject>(spec: OpenApiDocument, object: T | undefined): T | undefined {
  return object?.$ref
    ? { ...resolveLocalRef(spec, object.$ref), ...object, $ref: object.$ref } as T
    : object;
}

function securityText(requirements: SecurityRequirement[] | undefined, spec: OpenApiDocument): string {
  if (requirements === undefined) requirements = spec.security;
  if (requirements === undefined) return 'Not specified';
  if (requirements.length === 0) return 'None';
  return requirements.map((requirement) => {
    const entries = Object.entries(requirement);
    if (!entries.length) return 'Anonymous';
    return entries.map(([name, scopes]) => scopes?.length ? `${name} (${scopes.join(', ')})` : name).join(' AND ');
  }).join(' OR ');
}

function renderSecurity(spec: OpenApiDocument): string {
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

function serverUrls(spec: OpenApiDocument): Array<{ description?: string; url: string }> {
  if (spec.servers?.length) return spec.servers.map((server) => ({ url: server.url, description: server.description }));
  if (spec.swagger) {
    const schemes = spec.schemes?.length ? spec.schemes : ['https'];
    return schemes.map((scheme) => ({ url: `${scheme}://${spec.host || '<host>'}${spec.basePath || ''}` }));
  }
  return [];
}

export function collectOperations(spec: OpenApiDocument): OperationGroup[] {
  const groups = new Map<string, OperationItem[]>();
  for (const [route, rawPathItem] of Object.entries(spec.paths || {})) {
    const pathItem = resolvedObject(spec, rawPathItem) || rawPathItem;
    for (const [method, rawOperation] of Object.entries(pathItem || {})) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;
      if (!isObject(rawOperation)) continue;
      const operation = resolvedObject(spec, rawOperation as OpenApiObject) ?? rawOperation as OpenApiObject;
      const group = operation.tags?.[0] || 'Untagged';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push({ route, method: method.toUpperCase(), operation, pathItem });
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

export function formatGroupList(spec: OpenApiDocument): string {
  const groups = collectOperations(spec);
  const width = Math.max('GROUP'.length, ...groups.map(([name]) => name.length));
  return [
    `${'GROUP'.padEnd(width)}  OPERATIONS`,
    `${'-'.repeat(width)}  ----------`,
    ...groups.map(([name, operations]) => `${name.padEnd(width)}  ${operations.length}`),
    '',
  ].join('\n');
}

export function groupList(spec: OpenApiDocument): Array<{ name: string; operations: number }> {
  return collectOperations(spec).map(([name, operations]) => ({
    name,
    operations: operations.length,
  }));
}

function levenshteinDistance(left: string, right: string): number {
  const a = left.toLocaleLowerCase();
  const b = right.toLocaleLowerCase();
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length]!;
}

function closestGroup(name: string, groups: OperationGroup[]): string | undefined {
  if (!groups.length) return undefined;
  const candidates = groups
    .map(([candidate]) => ({ candidate, distance: levenshteinDistance(name, candidate) }))
    .sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate));
  const best = candidates[0];
  if (!best) return undefined;
  const threshold = Math.max(2, Math.floor(Math.max(name.length, best.candidate.length) / 3));
  return best.distance <= threshold ? best.candidate : undefined;
}

export function referencedSchemaNames(groups: OperationGroup[], spec: OpenApiDocument): Set<string> {
  const names = new Set<string>();
  const visitedRefs = new Set<string>();
  const visitedObjects = new Set<object>();

  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || visitedObjects.has(value)) return;
    visitedObjects.add(value);
    if (!isObject(value)) return;
    if (typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
      const schemaMatch = value.$ref.match(/^#\/(?:components\/schemas|definitions)\/(.+)$/);
      if (schemaMatch) {
        const name = decodeURIComponent(schemaMatch[1]!.replace(/~1/g, '/').replace(/~0/g, '~'));
        names.add(name);
      }
      if (!visitedRefs.has(value.$ref)) {
        visitedRefs.add(value.$ref);
        visit(resolveLocalRef(spec, value.$ref));
      }
    }
    for (const nested of Object.values(value)) visit(nested);
  }

  for (const [, operations] of groups) {
    for (const { operation, pathItem } of operations) {
      visit(operation);
      visit(pathItem.parameters);
    }
  }
  return names;
}

function renderParameters(parameters: OpenApiObject[], spec: OpenApiDocument): string {
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

function renderContent(
  content: Record<string, OpenApiObject> | undefined,
  spec: OpenApiDocument,
  options: GenerateOptions,
  headingLevel = 5,
): string {
  const lines: string[] = [];
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

function swaggerRequestContent(parameters: OpenApiObject[]): Record<string, OpenApiObject> {
  const body = parameters.find((parameter) => parameter.in === 'body');
  if (body) return { 'application/json': { schema: body.schema, example: body.example } };
  const form = parameters.filter((parameter) => parameter.in === 'formData');
  if (form.length) {
    return {
      'application/x-www-form-urlencoded': {
        schema: {
          type: 'object',
          properties: Object.fromEntries(form.filter((parameter) => parameter.name).map((parameter) => [parameter.name, parameter])),
          required: form.filter((parameter) => parameter.required && parameter.name).map((parameter) => parameter.name as string),
        },
      },
    };
  }
  return {};
}

function renderRequest(
  operation: OpenApiObject,
  parameters: OpenApiObject[],
  spec: OpenApiDocument,
  options: GenerateOptions,
): string {
  const rawBody = operation.requestBody ? resolvedObject(spec, operation.requestBody) : null;
  const content = rawBody?.content || swaggerRequestContent(parameters);
  if (!Object.keys(content).length) return '';
  const lines = ['#### Request body', ''];
  if (rawBody?.description) lines.push(rawBody.description, '');
  if (rawBody) lines.push(`Required: **${rawBody.required ? 'yes' : 'no'}**`, '');
  lines.push(renderContent(content, spec, options));
  return lines.join('\n');
}

function renderHeaders(headers: Record<string, OpenApiObject> | undefined, spec: OpenApiDocument): string {
  if (!headers || !Object.keys(headers).length) return '';
  const lines = ['Headers:', '', '| Name | Type | Description |', '|---|---|---|'];
  for (const [name, rawHeader] of Object.entries(headers)) {
    const header = resolvedObject(spec, rawHeader) || rawHeader;
    lines.push(`| ${inlineCode(name)} | ${escapeTable(schemaSummary(header.schema || header))} | ${escapeTable(header.description || '—')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderResponses(operation: OpenApiObject, spec: OpenApiDocument, options: GenerateOptions): string {
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

function renderExtensions(operation: OpenApiObject): string {
  const extensions = Object.entries(operation).filter(([key]) => key.startsWith('x-'));
  if (!extensions.length) return '';
  return ['#### Extensions', '', ...extensions.map(([key, value]) => `- ${inlineCode(key)}: ${inlineCode(JSON.stringify(value))}`), ''].join('\n');
}

function renderOperation(item: OperationItem, spec: OpenApiDocument, options: GenerateOptions): string {
  const { route, method, operation, pathItem } = item;
  const title = operation.summary || operation.operationId || `${method} ${route}`;
  const parameters = mergeParameters(pathItem.parameters, operation.parameters).map((parameter) => resolvedObject(spec, parameter) || parameter);
  const nonBodyParameters = parameters.filter((parameter) => !['body', 'formData'].includes(parameter.in ?? ''));
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
  const additionalTags = operation.tags;
  if (additionalTags && additionalTags.length > 1) metadata.push(`- Additional tags: ${additionalTags.slice(1).map(inlineCode).join(', ')}`);
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

function flattenSchemaProperties(
  schema: OpenApiObject,
  spec: OpenApiDocument,
): { properties: Record<string, OpenApiObject>; required: Set<string> } {
  const properties = { ...(schema.properties || {}) };
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  for (const part of schema.allOf || []) {
    const resolved = part.$ref ? resolveLocalRef(spec, part.$ref) : part;
    if (!resolved) continue;
    Object.assign(properties, resolved.properties || {});
    for (const name of Array.isArray(resolved.required) ? resolved.required : []) required.add(name);
  }
  return { properties, required };
}

function renderSchema(name: string, schema: OpenApiObject, spec: OpenApiDocument, options: GenerateOptions): string {
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

function renderSchemas(spec: OpenApiDocument, options: GenerateOptions, includedNames?: Set<string>): string {
  const schemas = spec.components?.schemas || spec.definitions || {};
  const entries = Object.entries(schemas)
    .filter(([name]) => !includedNames || includedNames.has(name))
    .sort(([a], [b]) => a.localeCompare(b));
  if (!options.schemaCatalog || !entries.length) return '';
  const lines = ['## Schema catalog', '', `${entries.length} reusable schema(s).`, ''];
  for (const [name, schema] of entries) {
    lines.push(renderSchema(name, schema, spec, options));
  }
  return lines.join('\n');
}

export function generateMarkdown(spec: OpenApiDocument, options: GenerateOptions = {}): string {
  options = { schemaCatalog: true, examples: true, includeExtensions: false, group: undefined, ...options };
  if (!spec || typeof spec !== 'object') throw new Error('The OpenAPI document must be a JSON object');
  if (!spec.openapi && !spec.swagger) throw new Error('Missing required "openapi" or "swagger" version field');
  if (!spec.paths || typeof spec.paths !== 'object') throw new Error('Missing required "paths" object');

  const title = spec.info?.title || 'API Reference';
  const allGroups = collectOperations(spec);
  let groups = allGroups;
  if (options.group !== undefined) {
    groups = allGroups.filter(([name]) => name === options.group);
    if (!groups.length) {
      const available = allGroups.map(([name]) => name).join(', ') || '(none)';
      const suggestion = closestGroup(options.group, allGroups);
      const hint = suggestion ? ` Did you mean ${JSON.stringify(suggestion)}?` : '';
      throw new Error(`Unknown group ${JSON.stringify(options.group)}.${hint} Available groups: ${available}`);
    }
  }
  const operationCount = groups.reduce((count, [, operations]) => count + operations.length, 0);
  const lines = [
    `# ${title}${options.group !== undefined ? ` — ${options.group}` : ''} API Reference`,
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

  const includedSchemas = options.group !== undefined ? referencedSchemaNames(groups, spec) : undefined;
  const schemas = renderSchemas(spec, options, includedSchemas);
  if (schemas) lines.push(schemas);
  lines.push('---', '', '_Generated by openapi-agent-reference. Do not edit manually; regenerate after the OpenAPI document changes._', '');
  return lines.join('\n').replace(/\n{4,}/g, '\n\n\n');
}
