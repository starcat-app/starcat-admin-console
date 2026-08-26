# Privacy

`starcat-admin-console` is designed as a local-first operator tool. Phase one does not include
product analytics, telemetry, or a hosted control plane.

## Data that may leave the machine

Only actions explicitly initiated by the operator may contact external systems. Depending on the
configured workflow, this can include:

- Starcat production APIs and Fly.io for administration operations;
- GitHub and web search providers for repository verification;
- the configured AI provider for interpreting pasted project clues and reviewing evidence.
- Google Cloud BigQuery when the operator reads quota, runs a SQL Lab query, or controls a Trainer
  workflow that downloads GitHub Archive public events.

Pasted text, repository candidates, search summaries, and bounded README excerpts may therefore be
sent to the configured AI provider during Agent-assisted import. The review screen must make this
boundary visible before the request is sent.

## Local data

Environment profiles, redacted operation history, draft imports, and data-platform Job metadata may
be stored locally. The PostgreSQL Job Catalog stores action identifiers, hashes, state, timestamps,
BigQuery job identifiers, and cost summaries; it does not store SQL text or result rows. SQL Lab
results remain in BFF memory for at most ten minutes. Secret values and ADC must not be exposed to
browser storage or exported diagnostics.

## Operator responsibility

Do not paste confidential, personal, licensed, or customer data unless the configured external
providers are authorized to process it. Review each candidate and its evidence before publishing.
