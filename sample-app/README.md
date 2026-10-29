# Practice Sheets — App

Printed practice sheets for kids in grades 1–6: a parent photographs a
finished sheet, and the sheet is marked against its stored answer key, with
per-question results and kid-friendly explanations for wrong answers.

See **SPEC.md** for the product brief and hard rules (grading never guesses —
unreadable answers are marked "unsure" for the parent to check; nothing
parent-facing ever mentions AI).

## Run it

```bash
npm install     # already done if node_modules/ is present
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

## What's implemented — Stage 1 (scaffold + data layer)

- **Next.js (App Router) + TypeScript** scaffold.
- **`lib/store.ts`** — the single data layer. All data access goes through
  this module; UI code never touches localStorage/IndexedDB directly, so the
  backend can be swapped for Supabase later without changing pages.
  - Records (localStorage, one versioned JSON document): `Parent`, `Kid`,
    `Sheet`, `AnswerKey`, `Submission`, `GradeResult`, `CheckResolution`.
  - Photos (IndexedDB): `savePhoto` / `getPhoto` / `deletePhoto` /
    `listPhotoKeys`; submissions reference photos by key.
  - CRUD helpers for every entity, plus `scoreFor()` — a pure helper that
    derives a score without ever counting an unresolved "unsure" as
    correct or wrong.
- **`lib/seed.ts`** — seed data loaded through the store on first run
  (`ensureSeeded()`): parent "David G."; kids Gina (Grade 4 · Math) and Leo
  (Grade 1 · Math); Gina's Math · Week 12 sheet (printed code
  `G4-MATH-W12-A`) with a 10-question answer key — the interactive
  prototype's demo sheet (52 − 27 with the borrowing explanation, 34 × 2,
  74 − 38, …), each question with prompt, correct answer, explanation,
  topic, and an `isReview` flag for spaced-review questions.
- **Home page** (`app/page.tsx`) — renders the full parent app (Stage 2,
  below).

## Stage 2 — parent app UI (HeroUI v3 + Tailwind v4)

The whole parent flow, mirroring the interactive prototype, in
`components/` behind a single client shell (`components/AppShell.tsx`):

- **Home** — account-level status slot (Needs-your-check card, or
  "All caught up for this week 🎉"), kid switcher, current-week Homework
  rows with download toasts, a two-stat Progress card, and an immutable
  History of past final sheets only.
- **Scan** — full-screen camera (getUserMedia with a graceful fallback),
  Upload Photo, staged thumbnail tray (photos stored via IndexedDB),
  full-screen photo preview with Remove, and a pinned Grade button.
  Grading is a **local mock** behind `lib/grading.ts` (`gradeStagedPhotos`)
  reproducing the Week 12 demo verdicts; Stage 3 swaps in `/api/grade`
  behind that same function.
- **Results** — live score badges ("7/8 graded" + "2 need your check",
  collapsing to a final pill), question-by-question list with explanations,
  and a guarded "Remove this sheet" (tap again to confirm).
- **Parent check** — one consolidated queue across kids.
- **Profile** — parent card, real member QR code, view-only kids list.

All data flows through `lib/store.ts`; `lib/derive.ts` builds the read
snapshot and derived state, `lib/demo.ts` owns the demo dataset lifecycle.

## Not yet built (later stages)

- Real grading pipeline at `/api/grade` (Stage 3) — currently the local
  mock in `lib/grading.ts`.
- Spaced review queue (deferred to v2), Supabase migration (only when real
  accounts / multi-device access are needed).
