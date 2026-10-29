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
- **Children's photos are private.** In this local-first phase they stay on
  the parent's device (IndexedDB); the grading server keeps no photos. A
  later cloud phase must use private storage with signed URLs only.
- **Enrollment is admin-only.** Hub staff add kids; the parent app has no
  add-child flow. The parent's Profile QR doubles as their member/pickup ID.
- **MVP scope:** no payments, no delivery/logistics features yet.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

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

### Parent app (local-first)

- All data access goes through `lib/store.ts` — records in localStorage
  (one versioned JSON document), photos in IndexedDB. UI code never touches
  storage directly, so the data layer can be swapped for Supabase later
  without changing screens. `lib/derive.ts` builds the read snapshot (home
  state, scores, streaks); `scoreFor()` never counts an unresolved `unsure`.
- Screens (`components/`, behind `AppShell.tsx`): **Sign-in** (emailed-link
  flow plus Skip; device-local), **Home** (status slot — Needs-your-check
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
app/            Next.js routes: page, layout, api/grade (+ [jobId]), api/config
components/     AppShell + screens (Home, Scan, Results, Check, Profile, SignIn), ui.tsx
lib/            store.ts (data layer), derive.ts, seed.ts, grading.ts (client),
                grade-contract.ts (wire types), demo.ts (seeded demo lifecycle)
lib/server/     jobs.ts, run-grade.ts, registry.ts, providers.ts, pi-config.ts,
                pi-harness.ts, pi/ (models.json, subjects.json, settings.json,
                prompts/, context/ error taxonomy)
docs/           stage-3-design.md (grading design), stage-3.5-design.md (result lifecycle), wireframe/ (design reference)
```

## Status

- **Done:** scaffold + data layer; the full parent UI; Stage 3 real grading
  (API, Pi harness, error analysis + generated guidance), verified
  end-to-end against the live Meta provider, including messy-handwriting
  cases that genuinely exercise the `unsure` path; Stage 3.5 result
  lifecycle (background marking, per-photo outcomes with retries and
  partial success, blank-answer verdicts, rescan protection —
  `docs/stage-3.5-design.md`).
- **Not built yet:** English grading agent (launch is math-first),
  spaced-review queue (deferred to v2), Supabase migration
  (only when real accounts / multi-device access are needed).
