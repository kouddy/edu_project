# Stage 3.5 Design — Result Lifecycle: Blanks, Failures, Retries, Rescans, Background Marking

Status: **spec** (decided in conversation 2026-10-29; not yet built).
Builds on `docs/stage-3-design.md` (the grading pipeline). Where this doc
and the Stage 3 doc disagree about outcomes and retries, this doc wins.

## Principles

1. **One result of record per sheet.** A sheet's stored result changes only
   under the rescan rules in §5.
2. **The parent is interrupted only for things only they can fix.**
   Everything else is handled silently, or reported once, in plain
   first-person language (the copy rule: no mention of AI, models,
   attempts, or jobs).
3. **Nothing is fabricated, and nothing graded is ever re-rolled.** A
   result that exists is never silently overwritten, and a successful
   grade is never retried to shop for a nicer verdict.

## 1. Verdicts — four, not three

Each question ends as `correct`, `wrong`, `unsure`, or **no-answer**.

- The grader asserts blankness explicitly: the grade submission carries a
  per-question `noAnswer` flag, valid only with an empty read. It is a
  positive claim ("this box is empty"), not a low-confidence read.
- A `noAnswer` question grades as **wrong — no answer**: it scores
  immediately, Results shows "No answer written" with the answer key's
  explanation, and it **never enters Parent check** — there is no
  handwriting for a parent to adjudicate. Error analysis/guidance treat it
  like a wrong answer.
- **Any visible mark is not blank** — faint writing, a smudge, an erased
  ghost of a digit. The grade prompt states this boundary explicitly:
  read the mark if possible; if it can't be read confidently, the verdict
  is `unsure` (Parent check) as today.
- Server-side coercion is unchanged: a non-blank read under the 0.8
  confidence threshold becomes `unsure`, and the agent cannot argue past
  it.

## 2. Failure taxonomy (per photo)

Every photo in a job ends in exactly one outcome:

| Outcome | Meaning | Retryable |
|---|---|---|
| `graded` | Verdicts produced (any mix, incl. `unsure`) | — terminal |
| `duplicate` | Identifies to a sheet already graded in the same job | — terminal |
| `already-final` | The sheet already has a final result of record (§5) | — terminal |
| `rejected-deterministic` | Unknown printed code, no answer key registered, subject not active | stops early (see §3) |
| `rejected-read` | Photo can't be read / isn't a sheet photo | yes |
| `failed` | Timeout, provider error, invalid model output | yes |

Rejected and failed attempts **never write any record** — which is what
makes retakes unconditionally safe.

## 3. Retries — internal, bounded, invisible

- Retries happen per photo, inside the same job, up to **3 attempts
  total** (the first try counts).
- Only `rejected-read` and `failed` outcomes retry. A `graded` result is
  never re-run; other photos' successes are never re-run either.
- A `rejected-deterministic` outcome that repeats with the **same reason**
  stops early — retrying an identical photo against a missing key or an
  unknown code cannot change the answer. A read-type failure uses all 3
  attempts, because a second pass genuinely can read what the first
  couldn't.
- Attempts are invisible to the parent. Job progress steps stay in parent
  language ("Still working on 1 photo…"), and only the final outcome is
  ever reported.
- Cost bound: worst case is 3× the failed photos only.

## 4. Batches — a bag of photos, decided per photo

- A batch carries no up-front choices. Each photo is identified from its
  printed code; the registry binds the code to a sheet, a kid, and a
  subject, and the photo routes to that subject's grader. One batch may
  therefore mix sheets, kids, and (once Phase 4 lands) subjects, and each
  result lands in the right kid's Homework. Until a subject is active, its
  sheets are `rejected-deterministic`.
- **Duplicates:** photos are processed sequentially. If a photo identifies
  to a sheet already graded in the same job, the run stops after
  identification and the photo's outcome is `duplicate` — the sheet is
  marked once.
- **Partial success:** every `graded` sheet is recorded, regardless of
  what happened to the other photos. (This replaces the current
  first-rejection-fails-the-job behaviour in `run-grade.ts`.)
- When the job settles, the parent gets **one combined summary** in which
  every line names the kid + sheet. Photos whose outcome is
  `rejected-read` or `failed` after all attempts **return to the tray**;
  `duplicate` and `already-final` photos do not (there is nothing to
  retake).
- Example, all policies firing at once: *"We marked 4 sheets. Leo's photo
  couldn't be read after a few tries — it's in your tray to retake.
  Gina's Math · Week 12 already has its finished result, so we kept it
  as is."*

## 5. Rescans — a final result is a record

Protection is evaluated **at apply time**, against the sheet's current
stored state:

- **No result yet, or the existing result still has unresolved `unsure`
  questions:** the new grade replaces the old one. Resolutions made
  against the old result are discarded with it (accepted knowingly — the
  parent is mid-flow and iterating).
- **The existing result is final** (every `unsure` resolved; the score is
  settled): the new result is **not applied**. The photo's outcome is
  `already-final` and the parent is told: *"We already have the finished
  result for this sheet."* The deliberate undo is the existing guarded
  **Remove this sheet** action; after removal, a rescan applies normally.
- Rationale: a final result feeds the streak and the review-retention
  stats. Wrong-then-right must not launder the learning record once it is
  final, and right-then-wrong must not corrupt it with a stray draft.

## 6. Marking runs in the background

With retries, a batch can take minutes; Grade must not hold the parent on
a loading screen. (This removes the modal "Marking your sheets…" screen.)

- Tapping **Grade** creates the job, persists a pending-job record on the
  device — `{ jobId, photoKeys, submittedAt }`, stored next to the auth
  record — clears the tray, and navigates to Home.
- A **Marking card** sits in Home's top status slot while anything is in
  flight: one line per sheet with its live state ("Leo · Math · Week 12 —
  marking…" → "marked ✓"). Multiple concurrent batches aggregate into the
  same card. When everything settles, the card shows the §4 combined
  summary and is dismissible.
- A poller at the app-shell level tracks pending jobs while the app is
  open and applies each result as it lands (Homework flips, the check
  card appears, etc.).
- **Durability across app restarts:** on launch, for each pending job —
  if the server still has it and it's done, apply it; if the server has
  lost it (jobs are in-memory), **resubmit the same photos as a new job
  automatically**. Photos are deleted from IndexedDB only once their
  result has been applied or the parent removes them from the tray.
- No push notifications in the local-first phase — results are simply
  there at next open. Push arrives with real accounts (Supabase stage).

## Implementation map

- `lib/grade-contract.ts` — job result becomes a list of **per-photo
  outcomes** (§2) alongside the graded sheet results; a question grade
  gains the no-answer marker (e.g. `meta.noAnswer`).
- `lib/server/pi-harness.ts` — `submit_grade` schema gains `noAnswer`;
  the grade prompt gains the blank-boundary rule; identification result
  is surfaced to the runner so duplicates can short-circuit.
- `lib/server/pi/prompts/math.grade.md` — the blank/mark boundary wording.
- `lib/server/run-grade.ts` — sequential per-photo loop with the §3
  attempt policy; replaces first-rejection-wins with per-photo outcomes.
- `lib/server/jobs.ts` — progress steps reflect per-photo state.
- `lib/grading.ts` — split into dispatch / track / apply; **apply-time
  final protection** (§5); failed photos restored to the tray.
- `lib/store.ts` — pending-job records + helpers; photos released only on
  apply/removal.
- `components/AppShell.tsx` — background poller; Grade navigates Home
  instead of opening the marking screen; the summary surfaces once.
- `components/HomeScreen.tsx` — the Marking card in the status slot.
- `components/ScanScreen.tsx` — Grade dispatches (no blocking screen);
  returned failure photos reappear staged.
- `lib/server/providers.ts` (demo provider) — gains a no-answer case so
  the flow is exercisable without a model call; scripted patterns
  otherwise unchanged.

## Acceptance checks

1. Neat Gina sheet still grades 9/10 end-to-end, unchanged.
2. Messy sheet: the blank Q10 comes back wrong/no-answer ("No answer
   written") and does **not** appear in Parent check; Q9's ghost/cross-out
   still lands `unsure` (a mark is not blank).
3. One batch, same sheet photographed twice → one stored result, summary
   notes the duplicate.
4. Rescan of a sheet whose checks are outstanding → result replaced.
5. Rescan of a final sheet → record unchanged; parent sees the
   already-final line; after Remove this sheet, a rescan applies.
6. Batch of 3 with one unreadable photo → 2 sheets recorded, the bad
   photo back in the tray, failures named by kid + sheet; the job log
   shows the failed photo was attempted more than once and the successes
   exactly once.
7. Deterministic rejection (unregistered code) → attempted once more at
   most (same-reason stop), reported by name.
8. Mixed batch (Gina + Leo sheets) → each result lands under the right
   kid; Leo's Week 12 grades against the registered key.
9. Close the app mid-grade → on relaunch, results are applied (or the
   batch is resubmitted if the server lost the job); no photo is lost and
   none is applied twice.
10. No parent-facing string mentions attempts, jobs, AI, or models.

## Non-goals

- Push notifications and cross-device state (Supabase stage).
- English grading (Phase 4) — this spec only defines how a not-yet-active
  subject behaves inside a batch.
- Any change to the confidence threshold or the never-guess rule.
