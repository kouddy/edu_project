# Practice Sheets

Daily practice for kids in grades 1–6 — printed on paper, marked by AI.

## 🏛️ Meta Global AI Developer Hackathon 2026: Submission Overview

| Pillar / Criterion | Details |
| --- | --- |
| **Track** | Indie |
| **Working Live App** | https://edu-project-tv02.onrender.com/ (live deployment — choose **Demo** on the sign-in screen to try the seeded account (Amy, Grade 3, and Bob, Grade 4; no sign-up needed). You can use [sample answer sheets](https://github.com/kouddy/edu_project/tree/main/test/amy-week40-pdf-sheets) to test the app. |
| **3-Minute Demo Video** | https://youtu.be/ezoHTawaHo0<br/>In-repo: [demo-full-captioned.mp4](docs/demo_video/demo-full-captioned.mp4) |
| **Meta AI Models & Partners** | • **Muse Spark 1.3** (`api.meta.ai`): vision grading — reads the sheet photo and the child's handwriting, marks every answer against the answer key, and flags unsure answers instead of guessing<br/>• **Muse Spark 1.3** (`api.meta.ai`): guidance agent — builds a self-contained animated HTML lesson for each wrong answer, verified end to end before any child sees it<br/>• **Muse Image 1.0** (`api.meta.ai`): takes the verified HTML lesson as input and draws it as a one-page printable<br/>• **Muse Spark Open** (`meta-models/muse-spark-open-1026`) via **Baseten**: alternate inference route used in development |

**Disclaimer:** Everything in this repository — the mobile-friendly website, the three AI workflows (grading, guidance, and image generation), the worksheet books and registry the service marks against, and the demo video — was built from scratch during the Meta Global AI Developer Hackathon 2026 (October 26 – November 4, 2026).

## The problem
Every parent knows daily practice works. 

But the proven route — a learning centre — costs hundreds of dollars a month, plus the driving, twice a week, every week. For most families, that’s where it ends. 

And doing it yourself is no better — buy the workbooks, and every night it’s the parent marking page after page, and trying to explain the mistakes. 

So we kept the practice, and removed the centre, the driving, and the marking.

## The idea

Kids get printed practice sheets — real paper, no screens — in weekly
packets picked up from a local hub. Every sheet carries a printed code.
When a sheet is done, the parent takes a photo of it in the app.
Everything after that is automatic: the sheet is marked, wrong answers
come back with explanations and a short animated lesson, and the lesson
can be saved as a printable poster for the fridge.

## What a parent experiences

1. **Photo in.** The parent photographs finished sheets; photos stage in
   a tray and marking starts on one tap.
2. **Marking.** Each sheet is identified by its printed code and marked
   against its stored answer key — per-question results, with a short
   plain-language explanation for every question.
3. **A check, only when it matters.** If an answer couldn't be read
   confidently, it is never guessed: it comes to the parent as a
   one-tap check — "Was Amy's answer correct?"
4. **Help that teaches.** Every wrong answer carries a **Help me** link
   to a short animated lesson that teaches the method step by step,
   with the question's own numbers.
5. **A printable.** The same lesson is also drawn as a one-page poster
   (the method in pictures, with the book's animal teacher on it) that
   the parent can download and print.
6. **Progress at a glance.** Home shows this week's packet, what's
   done, a streak, and review retention; finished weeks are kept in
   History.

## The AI

3 workflows uses AI:
- **Grading agent.** A vision agent session runs per photo: it reads
  the printed sheet code (the server looks up the answer key — the
  client never sends one), reads the child's handwriting, and submits
  structured verdicts through schema-typed tools. Verdicts under the
  0.8 confidence threshold are coerced to `unsure` server-side and go
  to the parent check instead of being guessed. For wrong answers it
  also writes the short explanation the parent sees. 
  Meta muse-spark-1.3 is used with its vision capability.
- **Guidance agent.** After marking, each wrong, confidently-read question queues a background job. 
  The agent builds a self-contained
  animated HTML lesson that animates the *same method* the grading
  guidance described. 
  Before any child can see a lesson, a verifier renders it headlessly, steps
  it to the end, and asserts the final answer equals the key; on
  failure the lesson regenerates (bounded) or stays text-only.
  Meta muse-spark-1.3 is used to generate HTML lesson.
- **Image generation.** HTML lesson is fed into image model, muse-image-1.0, to turn
  HTML lesson into a still, printable version — the method in 4–6 pictured
  steps.
- **The harness.** All agents run on a Pi-based harness
  (`lib/server/pi-harness.ts`): short-lived in-memory sessions,
  built-in tools disabled, only schema-typed submit tools, per-agent
  provider/model/thinking settings in `lib/server/pi/subjects.json`
  (defaults: Meta `muse-spark-1.3-contributor`; images:
  `muse-image-1.0`), provider keys referenced from the environment in
  `lib/server/pi/models.json`, and per-agent environment overrides
  (`GRADING_PROVIDER`, `GUIDANCE_PROVIDER`, `IMAGE_PROVIDER` …). A background worker
  (15-second poll, bounded concurrency, leases and backoff) runs the
  guidance queue; a sweep restarts generations that were interrupted.


Built with Next.js (App Router) + TypeScript + HeroUI.

## Run it locally

You need Node 20+, npm, and Docker Desktop running. Copy `.env.example` to `.env.local` and fill in Meta API keys.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

- Visit http://localhost:3000
- The **Demo** button on the sign-in screen enters a seeded test
  account (Amy, Grade 3, and Bob, Grade 4) that opens the way a real
  account looks mid-term: both kids are on Week 40, Weeks 38 and 39 are
  marked in History, one of Amy's Week 40 sheets is marked, and one
  answer is waiting for a parent check. Everything stays on-device; no
  server account is involved.
- **Demo** Mode still uses LLM models for grading, providing guidance, and generating guidance images. Set `META_API_KEY` in `.env.local` (see [Grading provider](#grading-provider)). 

### Live mode (real accounts on a local Supabase stack)

Live mode adds real parent accounts: magic-link sign-in, with kids,
results and photos persisted server-side. It runs on the Supabase local
stack in Docker. To run the same mode against
the hosted project instead, skip to [Live mode on the hosted Supabase project](#live-mode-on-the-hosted-supabase-project).

1. Start Docker Desktop.
2. Start the stack. The first run downloads its images and takes a few
   minutes:

   ```bash
   npm run supabase:start
   npm run supabase:status   # prints the API URL and keys; run it anytime
   ```

3. Visit http://127.0.0.1:54323/ -> Project Settings -> API Keys -> Find Publishable key and Secret key.

4. In Authentication -> URL Configuration -> Redirect URLs, add http://localhost:3000 and http://127.0.0.1:3000

5. In `.env.local` set:

   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<Secret key>
   ```

6. Start (or restart) the app with `npm run dev` and open
   http://127.0.0.1:3000 or localhost:3000.
7. Enter your email and choose **Email me a sign-in link**. Open the local  mail catcher at http://127.0.0.1:54324 and click the link there. First sign-in shows "No children are on your account yet". The parent row is created automatically; kids are enrolled by staff.
8. Enroll a test kid in Supabase Studio (http://127.0.0.1:54323), SQL
   editor:

   ```sql
   with new_kid as (
     insert into public.kids (parent_id, name, grade)
     select id, 'Amy', 3 from public.parents
     where email = 'you@example.com'
     returning id
   )
   insert into public.enrollments (kid_id, subject, current_week)
   select id, 'Math', 40 from new_kid;
   ```

   One enrollment per subject track — a kid can take several subjects (although we only have math currently),
   each on its own current week (weeks 1–40 are the weekly packets;
   week 41 is the finals week).

   Reload the app: the kid appears with a packet for each enrollment's
   grade, subject and current week. Grade as usual — results and photos persist server-side
   (check the `submissions`, `grade_results`, `photo_blobs` and
   `check_resolutions` tables in Studio). Signing in from a second
   browser shows the same account, photos included.

Shut down and reset:

```bash
npm run supabase:stop    # stop the local stack
npm run supabase:reset   # wipe the database; reapplies migrations + seed
```


### Testing on a phone

Browsers only allow the camera in a secure context — HTTPS. Give the dev server a public HTTPS address with a Cloudflare quick tunnel instead:

```bash
brew install cloudflared   # once, macOS

npm run dev                                   # terminal 1: the app, on port 3000
cloudflared tunnel --url http://127.0.0.1:3000   # terminal 2
```

Open the `https://<random string>.trycloudflare.com` address the tunnel prints on the phone; the camera works there.

Notes:
- A **502 Bad Gateway** from the tunnel means the dev server is not
  running (or is on a different port — check its `Local:` line); the
  tunnel itself is fine.
- The address changes every run, and while the tunnel is up anyone
  with the address can reach your dev server — stop it (Ctrl-C) when
  the session is over.

### Live mode on the hosted Supabase project

The same live mode, with Auth and Postgres on the hosted project
instead of the local Docker stack. The Next.js server still runs on
your machine; only Supabase moves. One-time setup:

1. Create the project at supabase.com — pick the region closest to
   your families (Canada (Central) keeps the data in Canada). Link
   this repo to it and push the schema — the
   migrations in `supabase/migrations/` are the source of truth:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   `link` asks for the project's database password. `db push` applies
   any migrations the hosted database hasn't seen yet, in order;
   `npx supabase migration list` shows local vs. remote state.
2. In the dashboard, **Authentication → URL Configuration**: set the
   Site URL and add the redirect URLs the app will run at — for now
   `http://localhost:3000` and `http://127.0.0.1:3000`. Add each new
   origin here before signing in from it.
3. Point `.env.local` at the hosted project (Project Settings → **API**
   for the Project URL, → **API Keys** for the Publishable key):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<Secret key>
   ```

Then run the app exactly as in the local flow (`npm run dev`, enter
your email, **Email me a sign-in link**) with two differences: the
magic link arrives as a real email and
enrollment happens in the Supabase dashboard's SQL Editor, with the same
kid + enrollment SQL statements. Persisted rows are visible in the dashboard's Table Editor (`submissions`, `grade_results`, `photo_blobs`,
`check_resolutions`).

### Advancing a kid's week

A track's current week moves when the hub hands out the next packet.
Besides updating `enrollments.current_week` in SQL, there is an
operator endpoint for it:

```
POST /api/admin/advance-week
{ "kidId": "<kid uuid>", "subject": "Math" }
→ { "kidId": "…", "subject": "Math", "currentWeek": 41 }
```

```bash
curl -X POST http://localhost:3000/api/admin/advance-week \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"kidId":"<kid uuid>","subject":"Math"}'
```

The endpoint exists only when the server has both `ADMIN_API_KEY`
(a key you choose) and `SUPABASE_SERVICE_ROLE_KEY` (the project's
Secret key) in its environment; without them it answers 503. It
advances one week per call, refuses at the finals week (41), and a
parent's sign-in can never call it — enrollments have no parent
write policy.

Day to day:

- **Schema changes** go in a new file under `supabase/migrations/`,
  never as edits to an already-pushed migration. `npx supabase db push`
  sends the new one to the hosted project; `npm run supabase:reset`
  applies it locally.
- **Email limits:** the hosted project's built-in sender allows only a
  few messages per hour — enough for testing, not for real parents.
  Custom SMTP is on the pre-launch checklist in
  `docs/production-plan.md`.
- **Back to local:** restore the `http://127.0.0.1:54321` values in
  `.env.local`, restart the app (and the local stack), and you're on
  Docker again. The two databases are independent; nothing syncs
  between them.

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
  emailed link when accounts are configured, plus Demo), **Home** (status slot — Needs-your-check
  card or "All caught up", kid switcher, current-week Homework, two-stat
  Progress card, immutable History of finished sheets), **Scan**
  (full-screen camera or Upload Photo; photos stage in a tray and grading
  starts only on **Grade**), **Results**, **Parent check** (one consolidated
  queue across kids), **Profile** (member QR).
- Demo data (`lib/demo.ts`): one file holds the whole demo dataset —
  the account (parent "Demo"; kids Amy, Grade 3, and Bob, Grade 4),
  their Weeks 38–40 packets, and the seeded marking history. A fresh
  profile opens with two weeks of History, one of Amy's Week 40 sheets
  already marked, and one answer awaiting check, so the Parent check
  flow is visible immediately.

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
  routing, each agent's runtime values and the shared grading policy
  live in `lib/server/pi/subjects.json`. Adding a provider is a models.json edit. Note: a Baseten
  provider is defined but its multimodal tool-calling path currently
  hangs, so it is not usable for grading.
- Answer-key registry (`lib/server/registry.ts`): printed code → sheet +
  versioned key. The registry is exactly the book catalogues in
  book-data — 2,047 sheets, all with keys.

## Repo map

```
app/            Next.js routes: page, layout, api/grade (+ [jobId]), api/config,
                api/guidance, api/account (+ resolutions, photos)
components/     AppShell + screens (Home, Scan, Results, Check, Help, Profile, SignIn), ui.tsx
lib/            store.ts (data layer), derive.ts, grading.ts (client),
                grade-contract.ts (wire types), demo.ts (the demo dataset),
                live-sync.ts + supabase-client.ts (live mode), account-contract.ts
lib/server/     jobs.ts, run-grade.ts, registry.ts, providers.ts, pi-config.ts,
                pi-harness.ts, pi-guidance.ts, guidance.ts, guidance-store.ts,
                guidance-worker.ts, pi/ (models.json, subjects.json, prompts/,
                context/ error taxonomy, skills/ guidance-animation),
                supabase.ts + account.ts
                (token verification, account payload, grading persistence),
                book-data/ (grade 2–5 book catalogues)
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
  codes, the grade 2–5 catalogues in book-data); demo mode; parallel grading;
  Phase 1 accounts — Supabase magic-link sign-in (live mode) with kids,
  results and photos persisted server-side under row-level security
  (`docs/production-plan.md`); Phase 1.5 — the hosted Supabase project
  is live, migrations pushed, and magic-link sign-in verified against
  hosted Auth.
- **Not built yet:** English grading agent (launch is math-first),
  spaced-review queue (deferred to v2), the Railway deployment and the
  PWA/Capacitor builds (Phases 2–4 of the production plan).
