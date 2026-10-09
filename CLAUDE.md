# CLAUDE.md: Paperwork Pilot conventions

Paperwork Pilot is a life-event bureaucracy navigator for India (Bengaluru first). A user
describes a situation and gets an ordered, dependency-aware checklist. The core value is
**order**: a step is locked until the steps it needs are done, and documents produced by an
earlier step are auto-satisfied for later steps.

## Product rules (never break these)

1. **Never present unverified data as verified.** Every seeded row has `verified = false`. The UI
   says "sample" or "not verified" until an admin has checked the source. Only the admin save path
   may set `verified = true`, and only from an explicit "I checked this against the source" box.
2. Show the disclaimer **"guidance, not legal advice"**, and show **last verified + source** on
   every step.
3. **Do not store uploaded documents.** We only track "have it / don't have it".
4. **No "we'll submit it for you" feature.** We guide; the user files.
5. Accessible by default: keyboard navigable, visible focus, labelled controls, `aria-live` for
   updates. Respect `prefers-reduced-motion` everywhere (CSS and JS).
6. `design/landing-page.html` is the approved design. Port its CSS tokens, typography, route board,
   stamp, queue token, scroll animations and theme toggle as they are. **Do not redesign.**

## Layout

```
api/      Express 5 + TypeScript + Prisma 7 + PostgreSQL + zod
  prisma/schema.prisma, prisma/migrations/
  src/engine/     PURE route-engine functions (no I/O, no clock). Heavily unit-tested.
  src/routes/     thin HTTP handlers: validate with zod, call a service, shape JSON
  src/services/   database + engine orchestration
  src/seed/       sample data (all verified=false) and the idempotent seeder
web/      React 19 + Vite + TypeScript + React Router + react-i18next, plain CSS variables
e2e/      one Playwright smoke test of the demo flow
design/   landing-page.html: the design source of truth. Do not edit; do not lint.
```

## Commands (run from the repo root)

| Command                                  | What it does                                             |
| ---------------------------------------- | -------------------------------------------------------- |
| `npm install` then `npm run db:generate` | install and generate the Prisma client                   |
| `npm run db:deploy` / `db:seed`          | apply migrations / seed sample data (create-if-missing)  |
| `npm run dev`                            | API on :4000 and web on :5173 (web proxies `/api`)       |
| `npm run check`                          | lint + format check + typecheck + unit/integration tests |
| `npm run e2e`                            | Playwright smoke test (needs the database)               |
| `start.bat` / `start.sh`                 | the whole stack in Docker, one command                   |

Tests must pass before every commit. Commit messages start with the phase, for example
`Phase 2: route engine with cycle detection and cascade undo`.

## TypeScript

- `strict` plus `noUncheckedIndexedAccess`. No `any`; use `unknown` and narrow.
- API is ESM (`"type": "module"`, NodeNext): relative imports end in `.js`.
- Validate every external input with **zod** at the HTTP edge. Domain code takes typed values.
- Use `import { type X }` for type-only imports (enforced by lint).
- Prefer small pure functions. Async code never leaves a floating promise (lint enforces it).

## API conventions

- The browser calls `/api/*`; Vite (dev) and nginx (Docker) strip the prefix. Routes are mounted
  without it: `GET /events`, `POST /cases`, and so on.
- Errors are always `{ "error": { "code": "snake_case", "message": "Plain English", "details"? } }`.
  Throw `HttpError`; do not hand-roll `res.status(...).json(...)` for errors.
- Dates are **`YYYY-MM-DD` strings in Asia/Kolkata**, never `Date` objects, inside the engine and
  JSON. Timestamps (`startedAt`, `doneAt`, `lastVerifiedAt`) are ISO-8601 UTC.
- The engine receives `today` as an argument. Never call `new Date()` inside `src/engine`.
- IDs are `cuid` strings. Events are also addressable by `slug`.
- Anonymous cases use a secret token (stored in the browser's localStorage, hashed with SHA-256 in
  the database, sent as `Authorization: Bearer <token>`). Compare hashes with `timingSafeEqual`.
- Admin uses `ADMIN_PASSWORD`; the session is an HMAC-signed httpOnly `SameSite=Strict` cookie.
  If `ADMIN_PASSWORD` is empty the admin panel is off. Every admin write needs `sourceUrl`
  and sets `lastVerifiedAt = now`.
- Feature flag `PRO_ENABLED`: when off, every `/pro/*` route is a 404.

## Tests

- Unit tests sit next to the code as `*.test.ts`. The engine must stay at near-complete coverage.
- API integration tests use the **real PostgreSQL** (`DATABASE_URL`), never a mocked Prisma. The
  global setup applies migrations; each test file truncates the tables it touches.
- Web tests use Testing Library and query by role and label, which doubles as an accessibility check.
- Playwright is for one smoke test of the demo flow only.

## Frontend conventions

- Plain CSS in `web/src/styles/`. Colour tokens, type scale and animations are ported verbatim from
  the landing page. Both themes (`prefers-color-scheme` and `data-theme`) must keep working.
- All public copy goes through `t()` (react-i18next). Only `en` is filled in; `hi` and `kn` are
  empty scaffolds that fall back to English. The staff-only admin screens (`web/src/admin`) are
  English-only for now and use plain strings; `src/i18n/i18n.test.ts` checks every `t('...')` key
  exists.
- Motion: every animation needs a `prefers-reduced-motion` fallback (the CSS block at the end of
  `base.css` handles most; JS-driven motion checks `useReducedMotion()`).
- Interactive elements are real `<button>` / `<a>` / `<input>` with visible `:focus-visible`.
- Announce state changes (step done, undone, reset, saved) through the shared `aria-live` region.

## Admin panel (`/admin`)

- Off unless `ADMIN_PASSWORD` is set. Sign-in sets an HMAC-signed httpOnly `SameSite=Strict`
  cookie (12 h); writes are also refused when the `Origin` header names another site.
- **Every write carries `sourceUrl`** (http/https only, validated by zod) and the server stamps
  `lastVerifiedAt = now`. `verified` is only ever true when the editor ticked "I checked this
  against the source"; editing never verifies by accident.
- Changes are applied inside a transaction and the **resulting route is validated** (no cycles, and
  every document a step needs must be producible by a step it waits for). A bad save throws and
  rolls back: 409 `dependency_cycle` (with the loop's path) or 409 `document_not_upstream`.
- The stale badge is `isStale()` in `engine/verification.ts`: never verified, or older than 90 days.

## Reminders (`api/src/reminders`)

- A node-cron job (`REMINDER_CRON`, default 09:00 Asia/Kolkata, off when `REMINDERS_ENABLED=false`)
  emails opted-in cases that have a not-done step due today or within 3 days. One email per case.
- Email goes through the `EmailProvider` interface (`src/email/provider.ts`). The only
  implementation is `ConsoleEmailProvider`, which logs the message and sends nothing. A real
  provider (SMTP, SES, ...) is a new class plus an `EMAIL_PROVIDER` value; nothing else changes.
- Each (case, step, deadline) is **claimed in `reminder_logs` before sending**; the unique key makes
  overlapping runs send once, and a failed send releases the claim so the next run retries.
  Opting out, unsubscribing or deleting the case erases the log (it holds the email address).
- Every email has an unsubscribe link: `/unsubscribe?case=&sig=` where `sig` is an HMAC of the case
  id. Opening the link does nothing; the page POSTs `/reminders/unsubscribe`. Links never contain
  the case access token.
- Run once by hand: `npm run reminders:run`.

## Data rules

- Seeded rows: `verified=false`, `lastVerifiedAt=null`. The seeder only creates missing rows and
  never touches rows an admin has edited.
- A step is **stale** when `lastVerifiedAt` is null or older than 90 days.
- Dependency edges must form a DAG within one event. The engine rejects cycles; the admin API turns
  that into a 409 `dependency_cycle` with the offending path.
