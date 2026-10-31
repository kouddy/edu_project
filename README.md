# Practice Sheets

Printed practice sheets for kids in grades 1–6. A parent photographs a
finished sheet; the app marks it against the sheet's stored answer key and
returns per-question results, with a plain-language explanation for each
wrong answer. Built with Next.js (App Router) + TypeScript; the parent UI
uses HeroUI v3 + Tailwind v4 and mirrors the design reference in
`docs/wireframe/`.

## Product rules

- **Grading never guesses.** If an answer can't be read confidently (below
  the confidence threshold), that question comes back `unsure` and the
  parent settles it in Parent check — it is never graded on a guess.
- **Copy rule:** nothing a parent sees ever mentions AI (or "model",
  "vision", "scan detection"). Parent-facing copy is plain first-person
  service language: "We marked the sheet", "We couldn't read this answer".
- **Answer keys stay server-side.** The client sends photos only; the
  printed code on the sheet is read from the photo and looked up in the
  server registry. Parents never type a sheet code or pick which child a
  sheet belongs to.
- **Children's photos are private.** In guest mode they stay on
  the parent's device (IndexedDB). In live mode they are stored in the
  account's own server database and are served only to the parent who
  owns them.
- **Enrollment is admin-only.** Hub staff add kids; the parent app has no
  add-child flow. The parent's Profile QR doubles as their member/pickup ID.
- **MVP scope:** no payments, no delivery/logistics features yet.

## Run it locally

You need Node 20+ and npm. Live mode (real accounts) also needs Docker
Desktop running.

### Guest mode (no account setup)

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

- The **Guest** button on the sign-in screen enters a seeded test
  account (Amy, Grade 3, and Bob, Grade 4) that opens the way a real
  account looks mid-term: both kids are on Week 40, Weeks 38 and 39 are
  marked in History, one of Amy's Week 40 sheets is marked, and one
  answer is waiting for a parent check. Everything stays on-device; no
  server account is involved.
- Grading still needs a provider in every mode: set `META_API_KEY` in
  `.env.local`, or `GRADING_PROVIDER=demo` for the scripted provider
  (see [Grading provider](#grading-provider)).

### Live mode (real accounts on a local Supabase stack)

Live mode adds real parent accounts: magic-link sign-in, with kids,
results and photos persisted server-side. It runs on the Supabase local
stack — the same Postgres, Auth and row-level-security policies as the
hosted product, in Docker. (Not SQLite: it has no RLS and different
types, so it cannot stand in for this.)

1. Start Docker Desktop.
2. Start the stack. The first run downloads its images and takes a few
   minutes:

   ```bash
   npm run supabase:start
   npm run supabase:status   # prints the API URL and keys; run it anytime
   ```

3. Create `.env.local` in the repo root (see `.env.example`) with the
   values the status output prints:

   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key>
   ```

   The current CLI labels this key **Publishable** (`sb_publishable_…`);
   older output calls it the *anon* key. It is the only Supabase key
   the app needs: the server verifies the parent's sign-in token and
   then reads and writes as that parent, with row-level security
   scoping every query to their own family — the Secret
   (service_role) key is not used. Add your grading key too
   (`META_API_KEY`, or `GRADING_PROVIDER=demo`).

4. Start (or restart) the app with `npm run dev` and open
   http://127.0.0.1:3000 — localhost:3000 works too; both are
   allow-listed redirect URLs in `supabase/config.toml`.
5. Enter your email and choose **Email me a sign-in link**. Local mail
   is not really sent: open the mail catcher at
   http://127.0.0.1:54324 and click the link there. You land in live
   mode. A first sign-in shows "No children are on your account yet" —
   the parent row is created automatically; kids are enrolled by staff
   (next step).
6. Enroll a test kid in Supabase Studio (http://127.0.0.1:54323), SQL
   editor:

   ```sql
   insert into public.kids (parent_id, name, grade, current_week)
   select id, 'Amy', 3, 40 from public.parents
   where email = 'you@example.com';
   ```

   Reload the app: the kid appears with the packet for their grade and
   current week. Grade as usual — results and photos persist server-side
   (check the `submissions`, `grade_results`, `photo_blobs` and
   `check_resolutions` tables in Studio). Signing in from a second
   browser shows the same account, photos included.

Shut down and reset:

```bash
npm run supabase:stop    # stop the local stack
npm run supabase:reset   # wipe the database; reapplies migrations + seed
```

Leave the Supabase variables unset and live mode turns off: the
sign-in screen offers the guest account only. `GET /api/config`
reports `accounts: true/false`, so you can
confirm which way the server booted. If repeated test sign-ins hit an
email rate limit, raise `email_sent` under `[auth.rate_limit]` in
`supabase/config.toml` and restart the stack.

### Grading provider

Grading needs a model API key. Create `.env.local` in the repo root (see
`.env.example`):

```
META_API_KEY=LLM_...
```

Restart the server after changing it. Sanity check: `GET /api/config`
should report the provider as available. Without a key, grading fails
honestly — the parent keeps their staged photos and sees "We couldn't mark
the sheet just now — please try again in a moment." For keyless
development, `GRADING_PROVIDER=demo` selects a scripted demo provider
(fixed verdict patterns, no model call); it is never used as a fallback.

## How it works

### Parent app

- All data access goes through `lib/store.ts` — records in localStorage
  (one versioned JSON document per mode), photos in IndexedDB. UI code
  never touches storage directly. In live mode the same records are a
  mirror of the server account, downloaded wholesale at sign-in and
  refreshed after each grading or check update, so the screens are
  identical across modes. `lib/derive.ts` builds the read snapshot (home
  state, scores, streaks); `scoreFor()` never counts an unresolved `unsure`.
- Screens (`components/`, behind `AppShell.tsx`): **Sign-in** (a real
  emailed link when accounts are configured, plus Guest), **Home** (status slot — Needs-your-check
  card or "All caught up", kid switcher, current-week Homework, two-stat
  Progress card, immutable History of finished sheets), **Scan**
  (full-screen camera or Upload Photo; photos stage in a tray and grading
  starts only on **Grade**), **Results**, **Parent check** (one consolidated
  queue across kids), **Profile** (member QR).
- Seed data (`lib/seed.ts`): parent "David G."; kids Gina (Grade 4 · Math)
  and Leo (Grade 1 · Math); seven sheets. A fresh profile opens with Gina's
  Math · Week 12 already marked and two answers awaiting check, so the
  Parent check flow is visible immediately.

### Grading (server)

- `POST /api/grade` accepts the staged photos and returns `202 { jobId }`.
  Marking runs **in the background** (Stage 3.5): Grade returns the parent
  to Home, a Marking card shows per-sheet progress, and the app shell
  polls `GET /api/grade/:jobId` and applies results as they land. Pending
  jobs persist on the device, so an app restart collects — or, if the
  server lost the job, resubmits — the batch. The job result is a list of
  **per-photo outcomes**: **graded**; **duplicate** (same sheet twice in
  one batch, marked once); **rejected** with a plain-language reason
  (unreadable photo, unknown sheet, missing answer key); **failed**.
  Batches succeed partially: failed photos are retried inside the job (up
  to 3 attempts) and then returned to the tray. A question whose answer
  box is completely empty is graded wrong as **no answer** (never a
  Parent check item); any visible mark is read or marked unsure. A
  finished sheet's result is never overwritten by a rescan. Nothing is
  ever fabricated. `GET /api/config` reports provider/model status
  without exposing keys. The full policy is `docs/stage-3.5-design.md`.
- The grader is an agent harness on the Pi SDK
  (`lib/server/pi-harness.ts`): one short-lived in-memory session per
  photo, built-in tools disabled, only schema-typed submit tools —
  `submit_identification` (reads the printed code; the server looks up the
  key), `submit_grade`, and for wrong answers `submit_error_analysis` +
  `submit_guidance`, which categorize the mistake against the taxonomy in
  `lib/server/pi/context/` and write the kid-friendly guidance Results
  displays. Verdicts under 0.8 confidence are coerced to `unsure`
  server-side. Full design: `docs/stage-3-design.md`.
- Providers are file-configured in `lib/server/pi/models.json` (Pi's
  native format; keys referenced as `$ENV_VAR`, never committed). The
  default provider is Meta (`muse-spark-1.3-contributor`); per-subject
  routing lives in `lib/server/pi/subjects.json`, global settings in
  `settings.json`. Adding a provider is a models.json edit. Note: a Baseten
  provider is defined but its multimodal tool-calling path currently
  hangs, so it is not usable for grading.
- Answer-key registry (`lib/server/registry.ts`): printed code → sheet +
  versioned key, seeded from `lib/seed.ts`. All 7 sheets have keys.

## Repo map

```
app/            Next.js routes: page, layout, api/grade (+ [jobId]), api/config,
                api/account (+ resolutions, photos)
components/     AppShell + screens (Home, Scan, Results, Check, Profile, SignIn), ui.tsx
lib/            store.ts (data layer), derive.ts, seed.ts, grading.ts (client),
                grade-contract.ts (wire types), guest.ts (seeded guest lifecycle),
                live-sync.ts + supabase-client.ts (live mode), account-contract.ts
lib/server/     jobs.ts, run-grade.ts, registry.ts, providers.ts, pi-config.ts,
                pi-harness.ts, pi/ (models.json, subjects.json, settings.json,
                prompts/, context/ error taxonomy), supabase.ts + account.ts
                (token verification, account payload, grading persistence),
                book-data/ (frozen grade 2–5 book catalogues)
supabase/       local stack config, migrations (accounts schema + RLS),
                seed.sql (staff enrollment examples)
docs/           stage-3-design.md (grading design), stage-3.5-design.md (result lifecycle), production-plan.md, wireframe/ (design reference)
```

## Status

- **Done:** scaffold + data layer; the full parent UI; Stage 3 real grading
  (API, Pi harness, error analysis + generated guidance), verified
  end-to-end against the live Meta provider, including messy-handwriting
  cases that genuinely exercise the `unsure` path; Stage 3.5 result
  lifecycle (background marking, per-photo outcomes with retries and
  partial success, blank-answer verdicts, rescan protection —
  `docs/stage-3.5-design.md`); Stage 4 book integration (printed sheet
  codes, the frozen grade 2–5 catalogues); guest mode; parallel grading;
  Phase 1 accounts — Supabase magic-link sign-in (live mode) with kids,
  results and photos persisted server-side under row-level security
  (`docs/production-plan.md`).
- **Not built yet:** English grading agent (launch is math-first),
  spaced-review queue (deferred to v2), hosted deployment and the
  PWA/Capacitor builds (Phases 2–4 of the production plan).
