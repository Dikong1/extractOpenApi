const test = require('node:test');
const assert = require('node:assert/strict');
const { generateMarkdown, sampleForSchema, formatGroupList } = require('../src');
const { parseArgs } = require('../src/cli');

const spec = {
  openapi: '3.1.0',
  info: { title: 'Example', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  security: [{ bearer: [] }],
  paths: {
    '/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        tags: ['Users'],
        operationId: 'getUser',
        summary: 'Get a user',
        parameters: [{ name: 'expand', in: 'query', schema: { type: 'boolean', default: false } }],
        responses: {
          200: { description: 'Found', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
        },
      },
    },
    '/sessions': {
      post: {
        tags: ['Auth'],
        operationId: 'createSession',
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Session' } } } },
        },
      },
    },
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      User: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' }, email: { type: ['string', 'null'], format: 'email' } },
      },
      Session: {
        type: 'object',
        properties: { user: { $ref: '#/components/schemas/User' }, token: { type: 'string' } },
      },
    },
  },
};

test('generates grouped, agent-friendly Markdown', () => {
  const markdown = generateMarkdown(spec);
  assert.match(markdown, /# Example API Reference/);
  assert.match(markdown, /<a id="group-users"><\/a>\n\n## Users/);
  assert.match(markdown, /### GET \/users\/\{id\}/);
  assert.match(markdown, /Operation ID: `getUser`/);
  assert.match(markdown, /\| `expand` \| `query` \| no \|/);
  assert.match(markdown, /\[`User`\]\(#schema-user\)/);
  assert.match(markdown, /<a id="schema-user"><\/a>\n\n### User/);
  assert.match(markdown, /"email": "user@example.com"/);
});

test('respects output switches', () => {
  const markdown = generateMarkdown(spec, { schemaCatalog: false, examples: false });
  assert.doesNotMatch(markdown, /## Schema catalog/);
  assert.doesNotMatch(markdown, /```json/);
});

test('lists the exact available group names and operation counts', () => {
  const output = formatGroupList(spec);
  assert.match(output, /^GROUP\s+OPERATIONS/m);
  assert.match(output, /^Auth\s+1$/m);
  assert.match(output, /^Users\s+1$/m);
});

test('generates only the requested exact group and its transitive schemas', () => {
  const markdown = generateMarkdown(spec, { group: 'Auth' });
  assert.match(markdown, /# Example — Auth API Reference/);
  assert.match(markdown, /### POST \/sessions/);
  assert.doesNotMatch(markdown, /### GET \/users/);
  assert.match(markdown, /### Session/);
  assert.match(markdown, /### User/);
  assert.throws(() => generateMarkdown(spec, { group: 'auth' }), /Unknown group "auth"/);
});

test('creates finite examples for recursive refs', () => {
  const recursive = { ...spec, components: { schemas: { Node: { type: 'object', properties: { child: { $ref: '#/components/schemas/Node' } } } } } };
  assert.deepEqual(sampleForSchema({ $ref: '#/components/schemas/Node' }, recursive), { child: '<recursive:Node>' });
});

test('parses CLI arguments', () => {
  assert.deepEqual(parseArgs(['input.json', '-o', 'docs/api.md', '--no-examples']), {
    command: 'generate', input: 'input.json', output: 'docs/api.md', schemaCatalog: true, examples: false, includeExtensions: false, group: undefined, json: false,
  });
  assert.equal(parseArgs(['input.json', '--group', 'Users']).group, 'Users');
  assert.equal(parseArgs(['input.json', '--list-groups']).command, 'groups');
  assert.equal(parseArgs(['groups', 'input.json', '--json']).json, true);
  assert.throws(() => parseArgs(['groups', '--group', 'Users']), /cannot be combined/);
});
