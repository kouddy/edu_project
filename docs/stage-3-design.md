# Stage 3 Design — Server-Side Grading with an Agent Harness

Status: decided 2026-10-28/29 (David). Phase 1 building on branch `stage3`.

## Core principle

Grading runs server-side in a Pi SDK agent harness — chosen for the higher
ceiling: models/APIs swap via configuration, each subject gets its own agent
with its own result shape (math = shape A now, English = shape B soon), and
the loop can take extra steps when a student has errors. The client never
supplies answer keys; the server is the source of truth for keys.

## Pieces

1. **Client (unchanged role)** — the local-first store stays the home for UX
   state, results, and photos. `lib/grading.ts` keeps its single swap point:
   it calls the API and falls back to the local mock if the API is
   unreachable or a run fails.
2. **API (two endpoints + one utility)**
   - `POST /api/grade` — accepts the staged photos plus minimal kid context
     (id/name/grade, for disambiguation only). Returns `202 { jobId }`,
     because a harness run takes tens of seconds.
   - `GET /api/grade/:jobId` — progress steps in parent language ("Reading
     the sheet", "Marking answers", "Writing guidance for the tricky ones"),
     then the final result.
   - `GET /api/config` — which provider/model each subject is configured
     with (names only, never keys), plus registry size.
3. **Server key registry** (`lib/server/registry.ts`) — printed code → sheet
   definition, assignment (which kid), and versioned answer key. For the
   hackathon it is a server-only module in this same Next.js app, seeded from
   `lib/seed.ts` data (`G4-MATH-W12-A → Gina`, key v1), never imported by
   client code. Later it moves to a database with the API unchanged. Results
   carry the `keyVersion` for reproducibility.
4. **Pi harness (per grading job)** — one ephemeral, in-memory Pi session per
   job, created with an explicit resource loader pointed at our own config
   directory — no ambient working-directory discovery, no persisted session
   files. The tool set is restricted to our grading tools only; Pi's built-in
   file/shell tools are excluded. API keys come from server env, never from
   committed files.
5. **File-based configuration** (`lib/server/pi/`) — Pi's configurability does
   the work:
   - `settings.json` — default provider, thinking level, retry behaviour,
     confidence threshold, per-sheet budgets.
   - `subjects.json` — subject manifest: subject → provider/model override,
     prompt set, context files, schema version, step/token budget.
   - `models.json` — providers and models in Pi's own native format
     (providers → baseUrl / api / apiKey as `"$ENV_VAR"` interpolation /
     models). Adding a provider is a file edit; the harness hands Pi's
     ModelRuntime a copy of this file. Current providers: `meta`
     (api.meta.ai, muse-spark-1.3-contributor) and `baseten`
     (inference.baseten.co, Muse Spark Open / DeepSeek V4.1 Flash) — both
     OpenAI-compatible and vision-capable.
   - `prompts/` — prompt templates per subject and stage (`math.identify`,
     `math.grade`, `math.error-analysis`, `math.guidance`; English added
     later).
   - `context/` — subject knowledge files: the math error taxonomy now, the
     English rubric later.
   - Later, a custom resource loader can serve these from a DB/admin tool
     instead of files — same harness, no API change.
6. **Subject agents** — a math agent now, English next. Each is defined by
   its prompt files, context files, and a set of schema-typed tools, which
   are the only way the agent can emit results: `submit_identification`,
   `submit_grade`, `submit_error_analysis`, `submit_guidance`. The tool
   parameters *are* that subject's result shape, validated before anything
   is accepted.
7. **Providers** — behind Pi's model layer, all defined in `models.json`:
   Meta Model API first (hackathon credits), Baseten as an alternate host,
   a scripted demo provider that reproduces the Week 12 pattern with no
   key configured (demo-day insurance), others added by editing the file.
   Provider selection: `GRADING_PROVIDER` env var overrides the manifest
   default. The model used is the subject manifest's model when the chosen
   provider offers it, else that provider's first listed model.

## The run, step by step

Photo in → agent identifies the printed code and the name on the sheet →
server looks up the key/assignment in the registry → agent grades against
the key → **for each wrong answer, further steps: categorize the error**
(borrow slip, place value, stopped after step one…) **and generate detailed
guidance** for that misconception — worked steps, where it broke, a
try-one-like-it question → assemble and return. Correct sheets skip the extra
steps, so they stay fast and cheap.

## Result contract

Canonical `sheetId`, `kidId`, `keyVersion`, and per question: the common
core (verdict, confidence, what the kid wrote) plus a subject `meta` — for
math: topic, error category, generated guidance. Three outcome types:
**graded**; **rejected** with a plain-language reason (a normal outcome,
routes to the Photo rejected screen); **failed** (budget exhausted or
invalid output after retries → client falls back to the local mock). The
full run trace is returned with the result and stored with it — that's the
eval data for comparing models in Stage 4.

## Guardrails

- Confidence under 80% is "unsure" — the agent cannot argue past it.
- Max steps and a token budget per sheet.
- Every tool output schema-validated.
- The server keeps no photos: process, return, discard.

## Out of scope

No auth/sync/sheet-generation APIs (those arrive with the Supabase stage),
no in-app review queue (v2).

## Build order

- **Phase 1** — ✅ done (branch `stage3`, commit 35d2efa8): endpoints + job
  plumbing + server key registry + Pi config directory, running the demo
  provider end-to-end.
- **Phase 2** — implemented (branch `stage3`): the math agent runs in a real
  Pi session (`lib/server/pi-harness.ts`) on the Meta provider —
  identification + grading via the `submit_identification` / `submit_grade`
  tools, server-side validation and confidence-rule enforcement in the tool
  executors, API `rejected` outcomes wired into the client (staged photos
  kept, back to Scan with the reason as a toast). Live end-to-end verified
  2026-10-29 against the real Meta API, both via the API and through the
  full parent UI flow (test sheet graded 9/10 in ~21s).
- **Phase 3** — implemented (branch `stage3`, 2026-10-29): after grading,
  wrong answers continue in the same session — `submit_error_analysis`
  categorizes each against the taxonomy (ids validated server-side against
  the taxonomy file) and `submit_guidance` writes per-question guidance
  (what happened / worked steps / try one like it, answer withheld). Both
  are best-effort: results merge into each wrong question's `meta`
  (`errorCategory`, `guidance`), the trace notes the categories found, and
  Results shows generated guidance when present, falling back to the key's
  static explanation. Live-verified on Meta: Q4 → `borrowing-slip` with
  generated guidance, ~37s end to end.
- **Phase 4** — the English agent, shape B.

## Environment variables

- `GRADING_PROVIDER` — `demo` (default) or a provider id from `models.json`.
- `META_API_KEY` — Meta Model API key (server-only; `MODEL_API_KEY` also accepted).
- `BASETEN_API_KEY` — Baseten API key (server-only).
- `PI_CONFIG_DIR` — optional override for the `lib/server/pi/` config directory.
