# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes       |
| < 0.4   | No        |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report security issues privately via GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) feature on this repository, or email the maintainer directly.

Include:
- A description of the vulnerability and its impact
- Steps to reproduce
- Any proof-of-concept code (if applicable)

We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days for critical issues.

## Security design notes

- JWT tokens are stored exclusively in **HttpOnly cookies** — never in localStorage or JS-accessible storage.
- Passwords are hashed with **bcrypt** via passlib (never stored in plaintext).
- `SECRET_KEY` must be ≥32 characters; the app crashes at startup in production if it is missing or weak.
- All sensitive endpoints are rate-limited via slowapi.
- The `/chat` endpoint includes a prompt-injection guard blocking known jailbreak patterns.
- CORS origins are restricted to configured domains; localhost is warned against in production mode.
- File uploads are capped at 8 MB and validated to be image/* content types.
