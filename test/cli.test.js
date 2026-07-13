const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const packageJson = require('../package.json');

const cli = path.resolve(__dirname, '../bin/openapi-md.js');
const fixture = {
  openapi: '3.1.0',
  info: { title: 'CLI fixture', version: '1.0.0' },
  paths: {
    '/users': {
      get: {
        tags: ['Users'],
        operationId: 'listUsers',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/sessions': {
      post: {
        tags: ['Auth'],
        operationId: 'createSession',
        responses: { 201: { description: 'Created' } },
      },
    },
  },
};

function invoke(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

test('prints package version and help', () => {
  const version = invoke(['--version']);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), packageJson.version);
  assert.match(invoke(['--help']).stdout, /openapi-md groups/);
});

test('lists groups as JSON through the real executable', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-md-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'openapi.json');
  fs.writeFileSync(input, JSON.stringify(fixture));

  const result = invoke(['groups', input, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    { name: 'Auth', operations: 1 },
    { name: 'Users', operations: 1 },
  ]);
});

test('reads stdin and writes a selected group to stdout', () => {
  const result = invoke(['generate', '-', '--group', 'Users', '--output', '-'], {
    input: JSON.stringify(fixture),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# CLI fixture — Users API Reference/);
  assert.match(result.stdout, /### GET \/users/);
  assert.doesNotMatch(result.stdout, /### POST \/sessions/);
});

test('keeps legacy syntax and suggests close group names', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-md-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'openapi.json');
  fs.writeFileSync(input, JSON.stringify(fixture));

  const legacy = invoke([input, '--list-groups']);
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.match(legacy.stdout, /^Auth\s+1$/m);

  const invalid = invoke(['generate', input, '--group', 'users', '--output', '-']);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Did you mean "Users"\?/);
});
