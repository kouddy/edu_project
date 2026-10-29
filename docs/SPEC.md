# Practice Sheets — Product Spec (Stage 1 brief)

Product: a practice-sheet service for parents of kids in grades 1–6.

- Parents receive printed worksheets. Each sheet has a unique sheet code printed
  in the corner (e.g. `G4-MATH-W12-A`) and clear answer boxes for the child.
- After the child finishes a sheet, the parent photographs it and uploads the
  photo.
- The photo is graded against the sheet's stored answer key, returning
  per-question results with kid-friendly explanations for wrong answers.

## Hard rules

- **Grading never guesses.** If an answer cannot be read confidently, that
  question is marked `unsure` for the parent to check — never graded on a guess.
- **Copy rule:** nothing a parent sees ever mentions AI (or "model", "vision",
  "scan detection"). Parent-facing copy is plain first-person service language:
  "We marked the sheet", "We couldn't read this answer — can you check it?",
  "We found the sheet".
- **Children's photos are private.** In this local phase they stay on the
  parent's own device (IndexedDB). After the later cloud migration they must
  live in private storage served only via signed URLs, never public links.
- **MVP scope:** no payments, no delivery/logistics features yet.

## Architecture (local-first phase)

- Next.js (App Router) + TypeScript.
- ALL data access goes through one data-layer module, `lib/store.ts`, so the
  implementation can be swapped to Supabase later without touching UI code.
- Records live in `localStorage`; photos live in IndexedDB (too big for
  localStorage).
- Children are enrolled by an admin (hub staff), not by parents — the parent
  app has no add-child form.
- The parent never picks a child or types a sheet code: the printed code is
  read from the photo, which identifies the sheet and the child.

## Build stages

1. Scaffold + data layer + seed + minimal home page (this stage).
2. Upload/scan flow (stage photos in a tray; grade only on "Grade").
3. Grading pipeline (`/api/grade`, key stays server-side).
4. Results + consolidated parent check queue.
5. Spaced review queue — DEFERRED to v2.
6. Hard-case testing (messy photos, rejection path).
7. Supabase migration — only when real accounts / multi-device are needed.
