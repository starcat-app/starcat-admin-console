# Changelog

All notable changes to Starcat Admin Console are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Local BigQuery operations workspace with monthly quota, WatchEvent / PushEvent download status,
  guarded SQL Lab results, and PostgreSQL-backed job audit metadata.
- Fixed Trainer actions for download lifecycle control and mandatory dry-run-bound read-only queries.

### Security

- SQL Lab restricts queries to one read-only `githubarchive` statement with a 10 GiB billing cap
  and a 200-row / 2 MiB result boundary; SQL and rows are not persisted in the job catalog.

## [0.1.0] - 2026-08-24

### Added

- Local-first React and shadcn/ui operations workspace with light, dark, and system themes.
- Explicit Test / Production switching, six-service health summaries, statistics, and typed actions.
- Per-service local profiles, production gateway routing, redacted credential state, and local BFF
  secret storage.
- Agent-assisted curated import with bounded GitHub verification, human review, and explicit Weekly
  publication.
- Discovery Awesome source CRUD and Fly.io environment and secret administration.
- Bilingual documentation, security and privacy policies, contribution templates, and CI checks.

### Security

- The BFF binds to loopback, validates Host and Origin, and never returns credential values to the
  browser.
- Production uses one shared API Key; only Weekly and Discovery expose separate Admin Key slots.

[Unreleased]: https://github.com/starcat-app/starcat-admin-console/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/starcat-app/starcat-admin-console/releases/tag/v0.1.0
