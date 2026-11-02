-- Practice questions on the guidance_animations rows.
--
-- A lesson is generated with 5 practice questions for the child to
-- try on the Help page; the app checks the child's answers against
-- the stored ones, so the set is verified before it is kept (the
-- generator submits a worked calculation per question and the gate
-- evaluates every statement). The set is stored as one jsonb value
-- on the lesson's row — prompt, answer, and the working behind the
-- answer — and served only through the guidance route, under the
-- same account gate as the lesson itself.

alter table public.guidance_animations
  add column if not exists practice_questions jsonb;
