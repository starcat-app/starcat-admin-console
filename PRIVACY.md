# Privacy

`starcat-admin-console` is designed as a local-first operator tool. Phase one does not include
product analytics, telemetry, or a hosted control plane.

## Data that may leave the machine

Only actions explicitly initiated by the operator may contact external systems. Depending on the
configured workflow, this can include:

- Starcat production APIs and Fly.io for administration operations;
- GitHub and web search providers for repository verification;
- the configured AI provider for interpreting pasted project clues and reviewing evidence.

Pasted text, repository candidates, search summaries, and bounded README excerpts may therefore be
sent to the configured AI provider during Agent-assisted import. The review screen must make this
boundary visible before the request is sent.

## Local data

Environment profiles, redacted operation history, and draft imports may be stored locally. Secret
values must use a server-side credential store, must not be exposed to browser storage, and must
never be included in exported diagnostics.

## Operator responsibility

Do not paste confidential, personal, licensed, or customer data unless the configured external
providers are authorized to process it. Review each candidate and its evidence before publishing.
