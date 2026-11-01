-- Enrollments: a kid's subjects live on their own rows, one per subject.
--
-- The kids row used to carry a single subject and a single current_week.
-- That baked in "one kid, one subject": a kid taking two subjects would
-- need two kid rows, and the two tracks could not sit on different weeks.
-- Each enrollment is one subject track with its own current week; the
-- account payload assigns one packet per enrollment.
--
-- current_week runs 1..41: weeks 1-40 are the weekly packets and week 41
-- is the finals week, the last week of a track.

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids (id) on delete cascade,
  subject text not null,
  current_week int not null default 1 check (current_week between 1 and 41),
  created_at timestamptz not null default now(),
  unique (kid_id, subject)
);

create index enrollments_kid_idx on public.enrollments (kid_id);

-- Every existing kid's one track becomes their first enrollment.
insert into public.enrollments (kid_id, subject, current_week)
select id, subject, current_week from public.kids;

alter table public.kids drop column subject;
alter table public.kids drop column current_week;

alter table public.enrollments enable row level security;

-- Parents read their own kids' enrollments; enrollment itself stays a
-- staff action done in SQL, so there is no client write policy.
create policy "parents see enrollments of their own kids"
  on public.enrollments for select
  using (exists (
    select 1 from public.kids
    where kids.id = enrollments.kid_id and kids.parent_id = auth.uid()
  ));
