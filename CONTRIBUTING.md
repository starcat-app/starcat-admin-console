# Contributing

Thank you for contributing to Starcat Admin Console.

## Local setup

Use Node.js 22+ and pnpm 11:

```bash
corepack enable
pnpm install
pnpm dev
```

The console is intentionally local-only. Tests must not require production credentials, modify
real Starcat data, or weaken the loopback Host and Origin checks.

## Before opening a pull request

- Discuss large behavior or architecture changes in an issue first.
- Keep each pull request focused.
- Add or update tests for behavior changes.
- Run the formatting, test, build, dependency-audit, and browser commands documented in
  `README.md`.
- Update both `README.md` and `README-ZH.md` when public behavior changes.
- Do not commit credentials, `.env` files, private data, generated binaries, or local databases.

## Pull requests

Complete the repository pull request template, explain the user-visible effect, and include the
commands and results used for verification.

At minimum, run:

```bash
pnpm check
pnpm audit --prod
pnpm exec playwright install chromium
pnpm test:e2e
```

Security vulnerabilities must be reported privately according to [SECURITY.md](./SECURITY.md),
not through a public issue or pull request.
