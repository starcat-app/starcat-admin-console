# Security Policy

## Reporting a vulnerability

Report suspected vulnerabilities through
[GitHub Security Advisories](https://github.com/starcat-app/starcat-admin-console/security/advisories/new). Do not publish credentials,
tokens, exploit details, private repositories, customer data, or Starcat private data in a
public issue.

Include the affected version or commit, environment, reproduction steps, and expected impact.
You should receive an acknowledgement within seven days.

## Supported versions

Security fixes are provided for the latest published stable release or the current default
branch when the project has not published a stable release.

## Project-specific boundaries

Phase one is a local-only operator tool:

- The server must bind to a loopback address by default and reject unexpected Host and Origin
  values. LAN or public binding is outside the supported boundary.
- Service keys, AI provider keys, GitHub tokens, and Fly credentials remain in the local
  backend-for-frontend. The browser may receive only redacted metadata such as whether a value is
  configured and a non-reversible fingerprint.
- Credentials must not be written to browser storage, URLs, logs, analytics, screenshots, import
  previews, or error payloads.
- Local credential files must be excluded from Git and created with owner-only permissions. Real
  values must never be committed.
- Production operations are allowed, but destructive or broad operations must present their exact
  target and impact before execution. Unknown write outcomes reuse the same payload and
  idempotency key rather than creating a second operation.
- Agent identification and publication are separate capabilities. The Agent must not receive the
  Weekly administration key and cannot publish without an explicit operator action.
- Remote deployment, multi-user access, and Internet-facing authentication are phase-two concerns
  and are not supported by the local-only security model.
