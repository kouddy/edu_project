-- Bounded retries for guidance images.
--
-- The guidance worker's sweep re-runs images that never finished:
-- a lesson ready with no image, an image left at generating by a
-- server that died mid-draw, and a failed image once its backoff
-- has passed. image_attempts counts generation failures on the
-- seed row (claims do not count, as with the lessons' attempts);
-- the sweep retries on the lessons' terms — 5 minutes, then 30 —
-- and at 3 attempts the image stays failed until an operator
-- clears its image columns.

alter table public.guidance_animations
  add column if not exists image_attempts integer not null default 0;
