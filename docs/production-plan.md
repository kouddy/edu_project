# Production Plan — Railway + Supabase + Dual Build (PWA / Capacitor)

Status: agreed direction (2026-10-30 discussion). Phase 1 is built and
verified on the `phase-1-supabase` branch; Phases 2–5 not yet built.

## Phase 1 as built (branch `phase-1-supabase`)

- `supabase/` holds the project: `config.toml` (magic-link redirects for
  localhost dev), one migration (parents, kids, submissions,
  grade_results, check_resolutions, photo_blobs + RLS), and a seed file
  documenting SQL enrollment. Local development uses the real local
  stack — `npm run supabase:start`, then copy the URL and keys it
  prints into `.env.local` (see `.env.example`). No SQLite anywhere:
  local and hosted run the same Postgres, Auth, and policies.
- A third app mode, **live**, sits beside demo and guest with its own
  local database. Signing in with a real magic link enters it; the
  database mirrors `GET /api/account` and seeds nothing locally.
- The server verifies the parent's token on `/api/account`,
  `/api/account/resolutions`, `/api/account/photos/:blobId`, and on
  `POST /api/grade` when a token is present (kid ownership enforced,
  403 otherwise). Graded results and their photos persist to the
  account as the job finishes; check rulings write through and re-sync.
- Deviation from the keys rule below, accepted for Phase 1: Results and
  Parent check render correct answers on the device, so the account
  payload includes the answer keys for the signed-in parent's own kids'
  assigned sheets — the same exposure the shipped demo/guest bundles
  already have. Keys still never sit in database tables. Moving correct
  answers into the grade-result payload (so keys never leave the
  server) is the follow-up that removes this.
- Verified end to end against a real Postgres + Auth + PostgREST
  stack: migration applies; RLS isolates two parents (and photo blobs
  have no client-facing policy at all); the magic-link round trip
  enters live mode; grading persists submissions, results, and photo
  bytes; a second browser profile sees the same account, including the
  stored photo and a resolved check; demo and guest modes unaffected.

## Target architecture

- **Railway** hosts the Next.js server: always-on Node process, the current
  codebase nearly unchanged. In-memory grading jobs keep working; the
  client's lost-job resubmit remains the safety net. Expected cost at pilot
  usage: ~$10–15/mo (Hobby plan is usage-metered; no sleep on any plan).
- **Supabase** provides Auth and Postgres.
  - Auth: magic link by email — the same flow the sign-in screen already
    presents, made real. Demo and guest modes stay local-only beside it.
  - Postgres tables: parent accounts, kids and enrollment, each kid's
    current week / assignments, grade results and history, check
    resolutions. Row-level security enforces that a parent reads only
    their own family's data.
  - The Supabase service-role key lives only in the server's environment
    (Railway), never in the app.
- **Photos are stored in Postgres to begin with**, in a dedicated
  `photo_blobs` table keyed by ID — never as columns on the rows the app
  queries constantly. A downscaled sheet photo is ~150 KB. Supabase free
  tier (500 MB) holds ~3,000 photos; Pro (8 GB, $25/mo) is the step when
  the pilot outgrows it. Photos are reachable only through the server,
  after it verifies the requesting parent.
- **Answer keys never move.** They stay in the server-side registry files
  (`lib/server/book-data/`), never in client-queryable tables.
- **One codebase, two builds**:
  - Web build → a real PWA (manifest, service worker, icons).
  - App build → a static export wrapped by Capacitor, calling the Railway
    API at a base URL baked in at build time (`NEXT_PUBLIC_API_BASE`).

## Server changes this requires

1. **Authentication checks on the API.** The server verifies the parent's
   Supabase token on grading and data requests, and confirms that any
   kid named in a request belongs to that parent. (Today the server
   trusts the client's kid context — acceptable locally, not in
   production.)
2. **Data layer points at the server.** All client data access already
   flows through `lib/store.ts`; for signed-in accounts it becomes an API
   client instead of localStorage/IndexedDB. Demo/guest keep the local
   behaviour.
3. **CORS on the API routes** (`/api/grade`, `/api/grade/:jobId`,
   `/api/config`), so the Capacitor shell's origin is accepted.
   Same-origin web traffic is unaffected.

## Phases

Each phase is independently verifiable before the next begins.

1. **Supabase + server-side data.** Create the Supabase project, schema,
   RLS policies, and magic-link auth. Server endpoints for account data
   (kids, assignments, results, photos). `store.ts` wired to them for
   signed-in users. Verify: real magic-link sign-in; the same account on
   two browsers shows the same kids and current week; a graded packet
   persists server-side.
2. **Railway deploy.** The repo deployed as a web service with
   `META_API_KEY` and the Supabase service key as environment variables.
   Verify: a real packet graded end-to-end from outside the home network.
3. **PWA completion.** Add `app/manifest.ts`, a minimal service worker
   (app shell cached; `/api/` never intercepted), and icons. Verify:
   install prompt on a phone browser; app opens offline to the shell.
4. **Capacitor packaging.**
   - Client fetches go through an API-base helper (only two call sites,
     both in `lib/grading.ts`).
   - `next.config.ts` gains a `BUILD_TARGET=app` mode producing the
     static export; `scripts/build-app.mjs` stashes `app/api` for the
     duration of that build (Next cannot export route handlers, and the
     native build does not need them) and restores it afterwards.
   - `capacitor.config.ts`: appId `com.toolkitfordev.practicesheets`,
     `webDir: "out"`. Native projects are generated per machine
     (`npx cap add ios` / `android`, gitignored), refreshed with
     `npm run cap:sync`.
   - Scan screen: on native, capture via the Capacitor Camera plugin;
     on web, the current in-page viewfinder. Photos land in the same
     tray and the same downscale-on-staging path either way.
   - Emulator addressing: iOS Simulator → `http://localhost:3000`;
     Android Emulator → `http://10.0.2.2:3000`; physical phone → the
     host's LAN address. Local HTTP needs each platform's
     cleartext/local-networking allowance (dev only; production is
     HTTPS).
   - These mechanics were spike-proven on 2026-10-30 (the spike was
     reverted; this plan is the record of what it established).
5. **Pre-real-parents checklist.**
   - Switch the Meta model from `muse-spark-1.3-contributor` back to
     Standard `muse-spark-1.3` before grading any real child's sheet
     (contributor traffic trains on prompts/completions).
   - RLS audit: confirm no table is readable across parents; photo blobs
     have no client-facing policy at all.
   - Custom SMTP for magic-link email if free-tier send limits bite.
   - Kid-data privacy review (COPPA/PIPEDA) before public enrollment.

## Costs at pilot scale

- Railway: ~$10–15/mo expected (usage-metered; $5 Hobby floor).
- Supabase: $0 free tier → $25/mo Pro when the photo-filled database
  outgrows 500 MB.
- Apple Developer: $99/yr, only when submitting to the App Store.
  Google Play: $25 one-time.

## Explicitly not in this plan

- **Vercel + Workflow.** Durable per-photo steps would replace the
  hand-rolled retries and eliminate the lost-job regrade — a genuine
  upgrade, but a re-architecture (jobs out of memory, photos through
  blob storage, the Pi harness packaged into functions). Optional later;
  the Railway path does not need it.
- **Object storage for photos** (Supabase Storage / Railway volumes):
  Postgres blobs first; migration stays a one-table job if ever needed.
- **React Native / Expo rewrite.** Capacitor keeps the existing UI
  pixel-for-pixel; the API contract is identical if this is ever
  revisited.
