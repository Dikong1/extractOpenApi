const fs = require('node:fs');
const path = require('node:path');
const packageJson = require('../package.json');
const {
  collectOperations,
  formatGroupList,
  generateMarkdown,
  groupList,
} = require('./openapi-to-markdown');

function usage() {
  return `Usage:
  openapi-md groups [openapi.json|-] [--json]
  openapi-md generate [openapi.json|-] [options]
  openapi-md [openapi.json|-] [options]       Legacy syntax

Commands:
  groups                    List exact primary-tag group names and operation counts
  generate                  Generate a full or single-group Markdown reference

Options:
  -o, --output <file|->     Output Markdown file, or - for stdout (default: API_REFERENCE.md)
  -g, --group <name>        Generate only the exact, case-sensitive group
  --json                    Emit machine-readable JSON from the groups command
  --list-groups             Legacy alias for the groups command
  --no-schema-catalog       Omit the reusable schema catalog
  --no-examples             Omit generated JSON examples
  --include-extensions      Include x-* operation extensions
  -v, --version             Show the package version
  -h, --help                Show this help

Use - as the input path to read OpenAPI JSON from stdin.
`;
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) throw new Error(`${option} requires a value`);
  return value;
}

function parseArgs(argv) {
  const args = [...argv];
  let command = 'generate';
  if (args[0] === 'groups' || args[0] === 'generate') command = args.shift();

  const options = {
    command,
    input: 'openapi.json',
    output: 'API_REFERENCE.md',
    schemaCatalog: true,
    examples: true,
    includeExtensions: false,
    group: undefined,
    json: false,
  };
  let inputSet = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '-v' || arg === '--version') options.version = true;
    else if (arg === '--list-groups') options.command = 'groups';
    else if (arg === '--json') options.json = true;
    else if (arg === '--no-schema-catalog') options.schemaCatalog = false;
    else if (arg === '--no-examples') options.examples = false;
    else if (arg === '--include-extensions') options.includeExtensions = true;
    else if (arg === '-g' || arg === '--group') {
      options.group = requiredValue(args, index, arg);
      index += 1;
    } else if (arg === '-o' || arg === '--output') {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      options.output = value;
      index += 1;
    } else if (arg === '-' && !inputSet) {
      options.input = arg;
      inputSet = true;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!inputSet) {
      options.input = arg;
      inputSet = true;
    } else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (options.command === 'groups' && options.group !== undefined) {
    throw new Error('The groups command cannot be combined with --group');
  }
  if (options.command !== 'groups' && options.json) {
    throw new Error('--json is only available with the groups command');
  }
  return options;
}

function readSpec(input) {
  const label = input === '-' ? 'stdin' : path.resolve(input);
  const source = fs.readFileSync(input === '-' ? 0 : label, 'utf8').replace(/^\uFEFF/, '');
  let spec;
  try { spec = JSON.parse(source); } catch (error) { throw new Error(`Invalid JSON in ${label}: ${error.message}`); }
  if (!spec || typeof spec !== 'object' || (!spec.openapi && !spec.swagger) || !spec.paths || typeof spec.paths !== 'object') {
    throw new Error('Input is not a valid OpenAPI document with a paths object');
  }
  return spec;
}

function writeFileSafely(outputPath, content) {
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(temporaryPath, content, 'utf8');
  try {
    fs.renameSync(temporaryPath, absolutePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
    fs.copyFileSync(temporaryPath, absolutePath);
    fs.unlinkSync(temporaryPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return absolutePath;
}

function run(argv = process.argv.slice(2), streams = process) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    streams.stderr.write(`Error: ${error.message}\n\n${usage()}`);
    return 1;
  }
  if (options.help) {
    streams.stdout.write(usage());
    return 0;
  }
  if (options.version) {
    streams.stdout.write(`${packageJson.version}\n`);
    return 0;
  }
  try {
    const spec = readSpec(options.input);
    if (options.command === 'groups') {
      const output = options.json ? `${JSON.stringify(groupList(spec), null, 2)}\n` : formatGroupList(spec);
      streams.stdout.write(output);
      return 0;
    }

    const markdown = generateMarkdown(spec, options);
    const groups = collectOperations(spec).filter(([name]) => options.group === undefined || name === options.group);
    const operations = groups.reduce((count, [, items]) => count + items.length, 0);
    if (options.output === '-') {
      streams.stdout.write(markdown);
      return 0;
    }
    const outputPath = writeFileSafely(options.output, markdown);
    const scope = options.group === undefined ? '' : ` for group ${JSON.stringify(options.group)}`;
    streams.stdout.write(`Generated ${outputPath}${scope} (${operations} operations, ${Buffer.byteLength(markdown)} bytes)\n`);
    return 0;
  } catch (error) {
    streams.stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}

function main(argv = process.argv.slice(2)) {
  process.exitCode = run(argv);
}

module.exports = { main, parseArgs, readSpec, run, usage, writeFileSafely };
