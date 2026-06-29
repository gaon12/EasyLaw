# EasyLaw Project Status

## What This Project Is

EasyLaw is a Korean legal-document comprehension service. Its first Beta target is public judgment discovery plus Easy-Read summaries that help non-lawyers understand the result, reasoning, important terms, and caveats.

The product is not positioned as legal advice. It is a reading and comprehension aid, with source-grounded metadata and clear boundaries around private user documents.

## Product Principles

- External law data wins over LLM-generated metadata.
- Public judgment catalog entries can exist before Easy-Read generation is complete.
- Users can subscribe by email and receive a notification when generation finishes.
- User-uploaded or pasted documents stay private to the user or organization.
- OCR is not a Beta core feature; text paste and text PDF extraction come first.
- TOTP is recommended for regular users and required for operations admins and organization owners.

## Architecture

- Framework: Next 16 App Router, Node runtime.
- Database: `better-sqlite3` with WAL mode and migration files in code.
- Storage: local SQLite file on a VPS/container persistent volume.
- Email: Resend, guarded so local development works without a key.
- Auth: email magic link, TOTP step-up, hashed recovery codes, SQLite-backed rate limits.
- External law integration: currently represented by a korean-law-mcp-compatible mock boundary in `src/lib/external-law.ts`.

## Implemented Areas

- Public catalog and generation job records.
- Email notification subscriptions with idempotent delivery records.
- Admin, organization, and personal management surfaces.
- TOTP setup, verification, recovery code use, management access policy tests.
- Wanted-inspired UI tokens and reusable site chrome.
- GitHub Actions CI for lint, unit tests, build, and browser smoke tests.

## Next Product Work

- Replace mock external law records with the real korean-law-mcp or other law API client.
- Connect login/signup forms to production session handling.
- Add text PDF extraction and private document upload boundaries.
- Add prompt version review and result approval workflows.
- Install Montage packages once GitHub Packages access is available and replace internal stand-ins with official components.

## Key Files

- `src/lib/db/schema.ts`: SQLite tables and migrations.
- `src/lib/auth.ts`: magic link, TOTP, recovery code flows.
- `src/lib/external-law.ts`: external-first law data boundary.
- `src/lib/jobs.ts`: generation job and notification orchestration.
- `src/app/page.tsx`: public landing portal.
- `src/components/site-chrome.tsx`: shared navigation, footer, service shortcuts.
- `.github/workflows/ci.yml`: GitHub Actions pipeline.
