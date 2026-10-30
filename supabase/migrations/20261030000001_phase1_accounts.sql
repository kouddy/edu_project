-- Phase 1: real parent accounts.
--
-- Identity lives in auth.users (Supabase Auth, magic link). Everything
-- below hangs off a parent row created the first time an authenticated
-- request reaches the server. Kids are enrolled by hub staff inserting
-- rows directly — there is deliberately no parent-facing way to create
-- a kid.
--
-- Grading photos are stored in Postgres (photo_blobs), one row per
-- photo, so metadata queries never touch image bytes. Answer keys are
-- NOT stored here at all: they stay in the server's registry files.
--
-- The application server uses the service role, which bypasses RLS.
-- These policies protect the anon/authenticated surface (PostgREST):
-- a signed-in parent can only ever see their own family's rows.

create table public.parents (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.kids (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  name text not null,
  grade int not null check (grade between 1 and 8),
  subject text not null default 'Math',
  current_week int not null default 1 check (current_week between 1 and 40),
  created_at timestamptz not null default now()
);

create index kids_parent_idx on public.kids (parent_id);

-- One live submission per kid + sheet: a rescan replaces the record,
-- matching the app's "latest submission wins" behaviour on device.
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  sheet_code text not null,
  status text not null default 'graded',
  created_at timestamptz not null default now(),
  graded_at timestamptz,
  unique (kid_id, sheet_code)
);

create index submissions_kid_idx on public.submissions (kid_id);

-- Per-question grades in the client's QuestionGrade shape, as JSONB.
create table public.grade_results (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  per_question jsonb not null,
  graded_at timestamptz not null default now()
);

create table public.check_resolutions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  question_number int not null,
  resolution text not null check (resolution in ('correct', 'wrong')),
  resolved_at timestamptz not null default now(),
  unique (submission_id, question_number)
);

create table public.photo_blobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  ordinal int not null,
  content_type text not null default 'image/jpeg',
  bytes bytea not null,
  byte_size int not null,
  created_at timestamptz not null default now(),
  unique (submission_id, ordinal)
);

create index photo_blobs_submission_idx on public.photo_blobs (submission_id);

alter table public.parents enable row level security;
alter table public.kids enable row level security;
alter table public.submissions enable row level security;
alter table public.grade_results enable row level security;
alter table public.check_resolutions enable row level security;
alter table public.photo_blobs enable row level security;

create policy "parents read and update their own row"
  on public.parents for all
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "parents manage their own kids"
  on public.kids for all
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

create policy "parents see submissions of their own kids"
  on public.submissions for select
  using (exists (
    select 1 from public.kids
    where kids.id = submissions.kid_id and kids.parent_id = auth.uid()
  ));

create policy "parents see results of their own kids"
  on public.grade_results for select
  using (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = grade_results.submission_id and kids.parent_id = auth.uid()
  ));

create policy "parents see resolutions of their own kids"
  on public.check_resolutions for select
  using (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = check_resolutions.submission_id and kids.parent_id = auth.uid()
  ));

-- Photo bytes have no client-facing policy at all: they are served only
-- by the application server, after it verifies the parent. (Enable RLS
-- with no policy = no access through PostgREST.)
