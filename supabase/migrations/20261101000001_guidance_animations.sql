-- Guidance animations as persisted background tasks.
--
-- One row per question (printed code + question number + key
-- version): the row is the task while it waits and runs, and the
-- artefact once it is ready — ready is terminal, so a question is
-- generated once and then served from storage for every kid.
-- Failures retry with backoff (attempts); rows whose worker vanished
-- (lease expired) return to pending, and a row claimed too many
-- times without finishing is failed as poison.
--
-- An artefact contains the correct answer, so parents never touch
-- this table directly: RLS is on with no policies, and all access is
-- through server routes — reads are gated by the caller's account,
-- the worker runs as the service role (operator machinery; the rows
-- hold no parent or kid data).

create table public.guidance_animations (
  id uuid primary key default gen_random_uuid(),
  printed_code text not null,
  question_number integer not null,
  key_version integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  html text,
  attempts integer not null default 0,
  claim_count integer not null default 0,
  last_error text,
  priority integer not null default 0,
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  claimed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (printed_code, question_number, key_version)
);

create index guidance_animations_claim_idx
  on public.guidance_animations (status, available_at, priority desc, created_at);

alter table public.guidance_animations enable row level security;

-- Atomically claim up to p_limit due tasks for one worker. Expired
-- leases are released first. The claim is a single statement, so two
-- workers can never take the same row (skip locked).
create or replace function public.claim_guidance_tasks(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
returns setof public.guidance_animations
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guidance_animations
     set status = 'failed',
         last_error = 'Claimed too many times without finishing.',
         claimed_by = null, lease_until = null, updated_at = now()
   where status = 'processing' and lease_until <= now() and claim_count >= 5;

  update public.guidance_animations
     set status = 'pending', claimed_by = null, lease_until = null, updated_at = now()
   where status = 'processing' and lease_until <= now() and claim_count < 5;

  return query
  update public.guidance_animations g
     set status = 'processing',
         claimed_by = p_worker_id,
         claim_count = g.claim_count + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where g.id in (
     select id from public.guidance_animations
      where status = 'pending' and available_at <= now()
      order by priority desc, created_at
      limit p_limit
      for update skip locked
   )
  returning g.*;
end;
$$;

-- Only the worker (service role) may claim; parents cannot reach the
-- function through the API.
revoke execute on function public.claim_guidance_tasks(text, integer, integer) from public;
grant execute on function public.claim_guidance_tasks(text, integer, integer) to service_role;
