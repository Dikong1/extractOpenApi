# Changelog

All notable changes to this project will be documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

## 2.1.0 - 2026-07-21

### Added

- TypeScript declarations for the public library API and OpenAPI document models.
- Optional `openapi-agent-reference` agent skill with installation and maintenance documentation.

### Changed

- Migrated the source, CLI entry point, and tests from JavaScript to strict TypeScript.
- Adopted Bun for dependency installation, type checking, tests, and local development.
- Added a Node-compatible CommonJS build in `dist/` and automated it before npm packaging.
- Updated CI and release workflows to verify Bun, TypeScript, compiled Node execution, and package installation.

## 2.0.0 - 2026-07-13

### Added

- `openapi-md` executable and `groups` / `generate` subcommands.
- JSON group discovery with `groups --json`.
- Standard input and standard output support through `-`.
- Public CommonJS library entry point.
- Cross-platform CLI integration tests and npm publishing safeguards.

### Changed

- The installed CLI command is now `openapi-md`.
- The minimum supported Node.js version is now 22.

## 1.0.2

- Added exact primary-tag group filtering and group discovery.
