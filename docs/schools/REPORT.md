# Driver for driving schools — report

Built overnight 17 Oct 2026 on branch `schools-crm` (worktree `~/Documents/smartie/driver-schools`),
from the task in `/tmp/glassy-driver-schools.txt`. `main`, the release build and the stores were
not touched. Spec and legal research: [`SPEC.md`](SPEC.md). Screenshots: [`screenshots/`](screenshots/).

## What was built

**Server** (`schools/server`, Rust, axum 0.8 + sqlx 0.9 + Postgres, one binary)
- Staff auth: e-mail + password (argon2), 30-day sliding session cookie, CSRF by Origin check,
  roles admin / instructor, every query scoped to the signed-in school.
- School profile, branches, instructors; courses (groups) with status, dates, exam date, JISCD
  course number, required theory/driving hours; students with the § 2b fields, guardian, the legal
  document checklist, GDPR dates; enrolments; theory lessons with attendance; driving lessons.
- App endpoints: join with a code (group code or one-use personal code), sync (idempotent upsert
  of the app's own rows + a readiness snapshot), me, unlink.
- Readiness computed server-side with the app's formula (ported, unit-tested against the same
  cases), per student and aggregated per course and school.
- Six PDF documents (genpdf, embedded DejaVu Sans): Prihláška na skúšku (príloha č. 2 vyhl.
  9/2009, text reproduced), Potvrdenie o absolvovaní kurzu (§ 23 vyhl. 45/2016 fields), Zmluva o
  vykonaní vodičského kurzu (§ 7 ods. 3), Súhlas zákonného zástupcu + GDPR notice, Výpis z prípravy,
  Prezenčná listina. Stored in the database with their payload; served inline.
- Deterministic demo seed: one school, 2 branches, 4 staff, 5 courses in different stages, 38
  students, theory with attendance, driving lessons, a month of synced app practice for 29 students,
  real-exam results for the finished course.
- Tests: 9 unit (crypto, readiness port, PDFs render with diacritics), 7 integration on throwaway
  databases (login + CSRF, dashboard reads, join + sync + unlink, group-code join and reinstall,
  lessons and attendance validation, every document, school isolation). All green.

**Web dashboard** (`schools/web`, Vite 8 + React 19 + TS + Tailwind 4, TanStack Router/Query, Slovak UI)
- Prehľad, Kurzy, Kurz (students ranked by readiness, join code, theory + attendance editing,
  documents), Žiaci (search, filter), Žiak (readiness card with components, trend, weak
  categories, mocks, real exam; driving lessons; app link; documents; editable data + checklist;
  enrolments), Autoškola (profile, people, branches). Light/dark. `tsc`, eslint and vitest clean.
- The UI kit (tokens, button, field, dialog, table, tabs, toast…) is Stereo's / Roadmaper v2's,
  copied in and recoloured to the Driver indigo.

**App** (behind `EXPO_PUBLIC_SCHOOLS_ENABLED`, default off)
- Settings → Autoškola → `app/school.tsx`: enter the 8-character code (asks for a name when it is
  a course code), see what is shared, sync now, disconnect. Strings in SK / EN / HU.
- `src/lib/school.ts`: join, throttled sync on Home focus (10 min; forced from the screen), leave;
  rows are marked `synced_at` only after the server accepted them; a 401 drops the link.
- Six new nullable columns on the settings row (migration + Drizzle schema). With the flag off
  nothing is rendered or called; the full Jest suite (48 suites, 418 tests, 11 new) passes.
- Verified end to end through the PWA build: joined the demo course with its group code, synced,
  the dashboard listed the new student as linked (`schools/web/scripts/pwa-smoke.mjs`,
  screenshots 10 and 11).

## How to run it locally

```sh
schools/dev.sh            # Postgres (schools/pg.sh, :55436) + API (:8090) + dashboard (:5190), demo data seeded
schools/dev.sh --reset    # reseed
```

Sign in at http://localhost:5190 as `jana@demo.sk` / `driver` (admin) or `peter@demo.sk` / `driver`
(instructor). Needs Rust, Node 20+, Homebrew `postgresql@16`; no Docker (the daemon was not running,
so the stack uses a project-local cluster like stereo does). Tests: `cargo test` in
`schools/server` (the cluster must be up), `npm test` / `npm run typecheck` / `npm run lint` in
`schools/web`, `npx jest __tests__/school.test.js` in the repo root.

App against the local server: `EXPO_PUBLIC_SCHOOLS_ENABLED=true EXPO_PUBLIC_SCHOOLS_API_URL=http://<Mac LAN IP>:8090 npx expo start`.
The worktree reuses the main checkout's `node_modules` through a symlink (gitignored); run
`npm install` there instead if that ever bites.

## Decisions and assumptions

1. **Reused the stereo / roadmaper v2 stack** (Rust axum + sqlx + Postgres, Vite + React + the UI
   kit) as the task preferred. Not reused: the event log / live queries / undo machinery; a CRM of
   this size does not need it yet and it would have doubled the surface.
2. **Password login for staff** instead of magic links: no mail provider is set up and the task
   forbade new external accounts. Invites and reset are listed as next steps.
3. **JISCD stays the system of record.** The research (SPEC § 1) shows the mandatory records and
   the osvedčenie live in JISCD; the product positions itself as the school's working CRM and
   the student-progress view, and every document says so where it matters.
4. **Readiness is recomputed on the server** from the synced events with the app's formula;
   open-mistake count, bank size, forecast and streak come from the app's snapshot because the
   server cannot derive them. The two agree by construction (same inputs, same weights).
5. **Join codes, not accounts, for students.** A student never creates an account: the code links
   an existing training relationship. A course code creates the student from the typed name; a
   personal code links the record the school made. Joining is the consent for sharing.
6. **Synced data stays with the school after a disconnect**, as a training record; deletion is
   the school's GDPR process. The app says so before joining.
7. **Slovak-only dashboard** for now (the buyer is Slovak); strings sit in a few components and a
   `format.ts` table, so a language layer is a mechanical change.
8. **Documents are templates**, honest about it in their footers: the legal texts are quoted, the
   contract clauses are ours and need a lawyer's pass before a school signs them.
9. The seed's "today" is the machine's date; snapshots and lessons are generated relative to it,
   so the demo always looks current.

## Codex review (one round)

See the section at the end of this file; the raw transcript is not committed (`schools/.dev-logs/`).

## Open questions for Mykhailo

1. Pricing and packaging: SPEC § 7 assumes 29/49 € per school per month with the app free for a
   paying school's students. Is the plan to keep selling the app to individuals too?
2. Do we want a JISCD integration at all (there is no public API; CSV import of the participant
   list is the realistic version), or stay a complement and say so?
3. Should instructors see only their own courses? (MVP: every staff member sees the whole school.)
4. Hosting: one small VM with Postgres is enough for a pilot; which provider, and under which
   domain (`skoly.driver.smartie.team`?).
5. Which two or three friendly autoškoly can try the demo? The research CSV (`research/`) has
   486 schools with e-mails.
6. Is the Žiadosť o udelenie vodičského oprávnenia (official A4 form) something schools want
   pre-filled, and is a printed copy accepted by the dopravný inšpektorát?

## Next steps

1. Invite flow + password reset (needs a mail provider), per-instructor course scoping.
2. Deep-link / QR join (`driver://school?code=…`) and the exam date pushed into the app.
3. Driving-lesson booking with instructor calendars.
4. Payments per enrolment and an accountant export.
5. Deploy: build the dashboard into the binary (`npm run build`, the server already serves
   `web/dist`), Postgres with backups, HTTPS, a DPA template for schools.
6. A retention job (course + 5 years) and a per-student erasure action.
