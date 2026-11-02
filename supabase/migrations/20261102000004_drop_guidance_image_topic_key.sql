-- Guidance images belong to their guidance row, not to a topic.
--
-- An image is drawn from one question's lesson and stored on that
-- lesson's row; it is read and written only through that row,
-- matched on (printed_code, question_number, key_version) exactly
-- like the lesson itself. The denormalized topic key added by
-- 20261102000001 — which let one question's read adopt another
-- question's image by topic — is dropped, with its index.

drop index if exists public.guidance_animations_image_topic_idx;

alter table public.guidance_animations
  drop column if exists image_topic_key;
