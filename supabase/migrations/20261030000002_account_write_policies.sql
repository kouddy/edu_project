-- Live-account data access runs as the signed-in parent: the app
-- server verifies the parent's token, then reads and writes through
-- PostgREST with that token, so RLS — not a service-role bypass — is
-- the boundary for every account query. The first migration gave
-- parents read access to their own family's rows; this one adds the
-- matching write access, each rule scoped to kids the parent owns.
-- Another parent's rows stay invisible and unwritable, and photo rows
-- remain reachable only through submissions of the parent's own kids.

create policy "parents add submissions of their own kids"
  on public.submissions for insert
  with check (exists (
    select 1 from public.kids
    where kids.id = submissions.kid_id and kids.parent_id = auth.uid()
  ));

create policy "parents update submissions of their own kids"
  on public.submissions for update
  using (exists (
    select 1 from public.kids
    where kids.id = submissions.kid_id and kids.parent_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.kids
    where kids.id = submissions.kid_id and kids.parent_id = auth.uid()
  ));

create policy "parents add results of their own kids"
  on public.grade_results for insert
  with check (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = grade_results.submission_id and kids.parent_id = auth.uid()
  ));

create policy "parents update results of their own kids"
  on public.grade_results for update
  using (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = grade_results.submission_id and kids.parent_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = grade_results.submission_id and kids.parent_id = auth.uid()
  ));

create policy "parents add resolutions of their own kids"
  on public.check_resolutions for insert
  with check (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = check_resolutions.submission_id and kids.parent_id = auth.uid()
  ));

create policy "parents update resolutions of their own kids"
  on public.check_resolutions for update
  using (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = check_resolutions.submission_id and kids.parent_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = check_resolutions.submission_id and kids.parent_id = auth.uid()
  ));

create policy "parents see photos of their own kids"
  on public.photo_blobs for select
  using (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = photo_blobs.submission_id and kids.parent_id = auth.uid()
  ));

create policy "parents add photos of their own kids"
  on public.photo_blobs for insert
  with check (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = photo_blobs.submission_id and kids.parent_id = auth.uid()
  ));

create policy "parents remove photos of their own kids"
  on public.photo_blobs for delete
  using (exists (
    select 1 from public.submissions
    join public.kids on kids.id = submissions.kid_id
    where submissions.id = photo_blobs.submission_id and kids.parent_id = auth.uid()
  ));
