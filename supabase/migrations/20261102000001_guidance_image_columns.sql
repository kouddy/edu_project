-- Guidance images, persisted on the guidance_animations rows.
--
-- A guidance image belongs to a topic, not a question: it is drawn
-- from the first lesson in the topic that finishes, and it is
-- stored on that lesson's row — the seed question's row. The topic
-- key is denormalized onto the row so finding a topic's image is
-- one indexed lookup instead of a scan of every sheet the topic
-- appears in. image_status is separate from the row's lesson
-- status: a ready lesson can have a generating, ready, or failed
-- image, and a failed image never touches the lesson.
--
-- Like the lesson, the image is stored as its data URL. The table
-- stays service-role only (RLS on, no policies): the image is
-- generic, but reads still go through server routes gated by the
-- caller's account.

alter table public.guidance_animations
  add column if not exists image_topic_key text,
  add column if not exists image_status text
    check (image_status in ('generating', 'ready', 'failed')),
  add column if not exists image_data_url text,
  add column if not exists image_error text,
  add column if not exists image_updated_at timestamptz;

create index if not exists guidance_animations_image_topic_idx
  on public.guidance_animations (image_topic_key)
  where image_topic_key is not null;
