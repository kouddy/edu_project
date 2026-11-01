-- Carry the grading-time method text on the guidance task, so the
-- generated animation teaches the same method the child was given
-- in the text guidance. Nullable: tasks queued lazily (an old
-- result opened later) and tasks queued before this column existed
-- have none, and generation then works from the question and the
-- answer alone, as it did before. claim_guidance_tasks returns
-- setof guidance_animations, so the column reaches claimed tasks
-- without a function change.

alter table public.guidance_animations
  add column if not exists method_text text;
