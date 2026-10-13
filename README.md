# Paperwork Pilot

A life-event bureaucracy navigator for India (Bengaluru first). Describe a situation ("my father
passed away", "moving to Bengaluru with a toddler", "starting a small business") and get an ordered,
dependency-aware checklist. Each step shows the form, documents, office or portal, fee, typical
wait, deadline, and what must be done before it.

The core value is **order**. A step is locked until the steps it needs are done, and a document
produced by an earlier step is ticked automatically for the steps after it.

> **Guidance, not legal advice.** Every fact in this repository is **sample data**
> (`verified = false`) until a person checks it against the official source. The app says so on
> every step. See [Verified vs sample](#verified-vs-sample).

## Run it

### The whole stack, one command (needs Docker)

| You are on    | Do this                                                       |
| ------------- | ------------------------------------------------------------- |
| Windows       | Double-click **`start.bat`** (Docker Desktop must be running) |
| macOS / Linux | `./start.sh`                                                  |

The first run creates `.env` with fresh random passwords, builds the images, starts Postgres, the
API and the website, and opens <http://localhost:8080>. The database is migrated and seeded with the
three sample situations automatically.

| What              | Where                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| The website       | <http://localhost:8080>                                                 |
| Admin panel       | <http://localhost:8080/admin> (password: `ADMIN_PASSWORD` in `.env`)    |
| Professional plan | <http://localhost:8080/pro> (set `PRO_ENABLED=true` in `.env`, restart) |
| Stop (keeps data) | `stop.bat` / `./stop.sh`                                                |
| Wipe the database | `docker compose down -v`                                                |

Reminder emails are **written to the API log, not sent** (`docker compose logs api`).

Only the website's port (8080) is opened on your computer; the API and database stay inside Docker.
If Windows says that port is not available, set `WEB_PORT` in `.env` to another number such as `8081`
and run `start.bat` again.

### For development (hot reload)

`dev.bat` on Windows does everything below. By hand, with Node 22+ and Docker (for Postgres):

```bash
npm run db:up                    # Postgres on :5432 (docker-compose.dev.yml)
npm run setup                    # install, generate Prisma client, migrate, seed
npm run dev                      # API :4000, web :5173 (the web proxies /api)
```

| Command                 | What it does                                                 |
| ----------------------- | ------------------------------------------------------------ |
| `npm run check`         | lint + format check + typecheck + all unit/integration tests |
| `npm run e2e`           | the one Playwright smoke test of the demo flow               |
| `npm run reminders:run` | run the reminder job once, now                               |
| `npm run db:reset`      | wipe and re-seed the development database                    |

Conventions and design rules for anyone changing the code are in [`CLAUDE.md`](CLAUDE.md).

## What is in it

| Phase | What                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | Monorepo (`api`, `web`, `e2e`), Docker Compose, strict TypeScript, lint/format, CI, `.bat` files                                                 |
| 1     | PostgreSQL schema (Prisma) and a seed of the 3 landing-page situations, all `verified=false`                                                     |
| 2     | Pure route engine: topological order, cycle detection, step status and "blocked by", document satisfaction, cascade undo, deadlines              |
| 3     | REST API: events, routes, keyword matching, anonymous cases with a secret token                                                                  |
| 4     | React front end ported from `design/landing-page.html` (same CSS, route board, stamp, queue token, theme toggle, reduced motion) on the real API |
| 5     | Admin panel: edit situations, steps, dependencies, documents, offices; stale badges; cycles refused with the loop shown                          |
| 6     | Email reminders (node-cron) through an `EmailProvider`; opt-in on the case page; unsubscribe link                                                |
| 7     | Visitor tips per step or office, moderation queue, dates, "this looks out of date" flags                                                         |
| 8     | Professional plan behind `PRO_ENABLED`: organisations, team, client dashboard with status pills and filters                                      |

The code lives in a standalone git repository (this folder, branch `main`, one commit per phase).

## Verified vs sample

**Nothing in the content is verified.** That is deliberate and enforced in code.

| Thing                                     | State                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The 3 situations and their 18 steps       | **Sample.** Taken from the approved landing page. `verified=false`, `lastVerifiedAt=null`, so every step shows "Sample data. Not verified." and a **stale** badge in admin |
| Fees, form numbers, waits, deadlines      | **Sample.** Not checked against any official source                                                                                                                        |
| Source links on each step                 | **Not checked.** They are the home pages of the relevant authority (`crsorgi.gov.in`, `bbmp.gov.in`, `kaveri.karnataka.gov.in`, ...), not the page that supports the step  |
| Offices and portals                       | **Sample** names; no addresses or opening hours                                                                                                                            |
| "Tips from people who stood in the queue" | **Sample text**, labelled "sample", with no date. Visitor tips show their date once approved                                                                               |
| The route engine                          | **Tested.** Order, locking, document hand-over, undo, deadlines, cycle rejection have unit and property tests                                                              |
| Only way to become verified               | An admin saves a step with a source link **and** ticks "I checked this against the source". Editing alone never verifies                                                   |
| `last verified` / source on every step    | Always shown. Older than 90 days (or never) is flagged stale                                                                                                               |

What was and was not exercised:

| Checked                                                                                                                                                            | Result                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API: 521 tests against a real PostgreSQL                                                                                                                           | pass                                                                                                                                                                                                     |
| Web: 257 tests (Testing Library + axe accessibility checks)                                                                                                        | pass                                                                                                                                                                                                     |
| Playwright smoke test of the demo flow in a real browser (describe, work the route, persist, undo)                                                                 | pass                                                                                                                                                                                                     |
| Production build from a clean export of the commits; the container start sequence (migrate, seed, start) run by hand against a fresh database and probed over HTTP | worked                                                                                                                                                                                                   |
| `docker compose config` on the compose file                                                                                                                        | valid                                                                                                                                                                                                    |
| **`docker compose up` itself**                                                                                                                                     | **never run.** The build machine has the Docker CLI but no Docker daemon. The steps in the Dockerfiles were reproduced by hand instead. The CI file builds the images, which will be the first real test |
| **`start.bat`, `stop.bat`, `dev.bat`**                                                                                                                             | **never run on Windows.** Written carefully, not executed                                                                                                                                                |
| Email                                                                                                                                                              | **Console only.** No real email is sent anywhere                                                                                                                                                         |
| Hindi and Kannada                                                                                                                                                  | **Empty scaffolds**; they fall back to English                                                                                                                                                           |
| Professional-plan sign-in                                                                                                                                          | **Interim access keys**, not email login (see below)                                                                                                                                                     |

The live demo on the landing page is a real case saved in your browser, not a script, so what you
tick and finish there is stored and survives a reload.

## Privacy and safety choices

- Uploaded documents are **never stored**. You only tick "I have it". There is no "we'll submit it
  for you" feature.
- A case belongs to the browser that made it: a secret token in `localStorage`, stored hashed on the
  server. Losing browser data loses access. A case can be deleted at any time.
- Reminders need an explicit opt-in and an email address, which is forgotten on opt-out. Every email
  has an unsubscribe link that works without signing in.
- Tips carry no author, and are refused if they contain links, email addresses or long numbers.
- Admin is off unless `ADMIN_PASSWORD` is set, and uses a signed `httpOnly` `SameSite=Strict` cookie.
- The professional plan's access key is its **only** credential until email login exists. Anyone
  holding a key can open that organisation's clients. Treat it like a password.

## The 5 things to do next to get real data in

1. **Verify the 18 steps against the official sources, one situation at a time.** Sign in to
   `/admin`, open a step, follow its source, and correct the form, fee, wait, deadline, documents
   and office. Save with the source link and tick "I checked this against the source" only when you
   did. Start with _A parent has passed away_; it is the one with legal deadlines. Until you do,
   nothing shows as verified, which is correct.
2. **Replace the home-page source links with the exact page** (the rule, circular or portal page)
   that supports each step, and fill in the **offices**: real addresses, hours, portal names. Decide
   how to handle ward-specific offices (BBMP wards differ); today an office is one row.
3. **Have a domain expert review the order and the documents.** A lawyer or CA for succession and
   bank claims, someone who has just moved for the rental, utility and Aadhaar steps, a GST or MSME
   consultant for the business route. The dependency order is the product, so ask "what really has
   to come first, and what can run in parallel?". Then delete or reject the sample tips and invite
   real ones through the moderation queue.
4. **Set a maintenance routine.** Pick an owner for each situation and review the stale list in
   admin every 90 days (the badge does this for you). Fees and rules change; a route nobody
   re-checks becomes wrong while looking authoritative.
5. **Widen it carefully.** Add the next situations (a birth, a marriage, losing a job, buying a
   home) through the admin panel with the same verify-first routine, and get the Hindi and Kannada
   text reviewed by native speakers before filling the empty `hi.json` and `kn.json`.

Before real users: put it behind HTTPS with real secrets in `.env` (a placeholder `SESSION_SECRET`
stops the API starting in production, and a placeholder `ADMIN_PASSWORD` switches the admin panel
off), write a real `EmailProvider` (SMTP, SES or similar, one small class) and set
`PUBLIC_URL`, and replace the interim professional access keys with email magic-link login.

## Layout

```
api/      Express 5 + TypeScript + Prisma 7 + PostgreSQL + zod
web/      React 19 + Vite + TypeScript + React Router + react-i18next
e2e/      one Playwright smoke test
design/   landing-page.html, the approved design (the source of truth for the look)
.github/workflows/ci.yml   lint, types, tests against Postgres, build, Playwright, Docker image build
```

## Configuration

Copy `.env.example` to `.env` (the start scripts do it for you). The ones that matter:

| Variable                             | What it does                                                      |
| ------------------------------------ | ----------------------------------------------------------------- |
| `SESSION_SECRET`                     | Signs admin sessions and unsubscribe links. 16+ random characters |
| `ADMIN_PASSWORD`                     | Turns the admin panel on. Empty means off                         |
| `PRO_ENABLED`                        | Turns the professional plan on. Off means every `/pro/*` is a 404 |
| `PUBLIC_URL`                         | Used for links inside reminder emails                             |
| `EMAIL_PROVIDER`                     | `console` (logs only). Add a class for a real one                 |
| `REMINDERS_ENABLED`, `REMINDER_CRON` | The reminder job and its schedule (default 09:00 India time)      |
