/**
 * lib/server/guidance-image.ts — the guidance image for a topic.
 *
 * Beside the animated lesson, a wrong answer can offer a printable
 * guidance image for the question's topic: the lesson's method laid
 * out as 4 to 6 steps in the lesson's own visual form — its numbers,
 * boxes and short captions, not added prose — drawn by the image
 * model. A guidance image goes with one question's guidance:
 * drawn from that question's lesson, it is cached by that question
 * — in memory and on disk, so a restart keeps it — and stored on
 * that lesson's own guidance_animations row when Supabase is
 * configured, so a new host keeps it too. That database copy
 * belongs to live lessons only: a demo lesson's image never reads
 * or writes it. The guidance worker's
 * poll sweeps those rows for images a crash left unfinished and
 * re-runs them on the lessons' backoff terms, so the generation
 * is as durable as the storage.
 *
 * A guidance image is drawn FROM the question's finished animated
 * lesson: the worker starts it the moment a lesson passes its gate,
 * feeding the lesson's HTML to the image model, so the image teaches
 * the same concept with the same verified numbers instead of
 * inventing its own. No finished lesson, no guidance image. One
 * image request is the whole pipeline — the guidance image is a
 * rendering of an already-checked lesson, so there is no second
 * check and no fix pass after it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findByPrintedCode, type RegistryEntry } from "./registry";
import {
  imageModelId,
  imageProviderId,
  loadPiConfig,
  providerDef,
  resolveProviderApiKey,
  type PiConfig,
} from "./pi-config";
import { dbGuidanceStore, memoryGuidanceStore } from "./guidance-store";
import { supabaseAdmin, supabaseForToken } from "./supabase";

interface GuidanceImageView {
  status: "generating" | "ready" | "failed";
  /** The guidance image as a data URL, when ready. */
  image?: string;
  error?: string;
}

type GuidanceImageRead =
  | { kind: "unknown" }
  | { kind: "forbidden" }
  | { kind: "ok"; view: GuidanceImageView };

/* The books' animal teachers, by the species key the pools use. */
const TEACHERS: Record<string, string> = {
  fox: "Felix Fox",
  raccoon: "Ruby Raccoon",
  dolphin: "Daisy Dolphin",
  turtle: "Tessa Turtle",
  owl: "Oliver Owl",
  rabbit: "Rosie Rabbit",
  monkey: "Milo Monkey",
  octopus: "Ollie Octopus",
  parrot: "Pippa Parrot",
  squirrel: "Sammy Squirrel",
  giraffe: "Gigi Giraffe",
  bee: "Bella Bee",
};

interface TeacherInfo {
  name: string;
  species: string;
  /** The prompt's phrase for the teacher: "Oliver Owl, a friendly cartoon owl". */
  label: string;
}

const teacherCache = new Map<string, TeacherInfo | null>();

/** The topic's teacher, read from the grade's pools file where
 *  topics carry their animal. */
function teacherFor(entry: RegistryEntry, topicTitle: string): TeacherInfo | null {
  const cacheKey = `${entry.kidGrade}|${topicTitle}`;
  if (teacherCache.has(cacheKey)) return teacherCache.get(cacheKey) ?? null;
  let found: TeacherInfo | null = null;
  try {
    const file = path.join(
      process.cwd(),
      "lib",
      "server",
      "book-data",
      "on",
      entry.subject.toLowerCase(),
      `questions-g${entry.kidGrade}.json`,
    );
    // The pools file is a bare list of topics, not an object
    // wrapping one — read it as either shape.
    const parsed = JSON.parse(readFileSync(file, "utf8")) as
      | { title: string; animal: string }[]
      | { topics?: { title: string; animal: string }[] };
    const topics = Array.isArray(parsed) ? parsed : (parsed.topics ?? []);
    const topic = topics.find((t) => t.title === topicTitle);
    if (topic && TEACHERS[topic.animal]) {
      found = {
        name: TEACHERS[topic.animal],
        species: topic.animal,
        label: `${TEACHERS[topic.animal]}, a friendly cartoon ${topic.animal}`,
      };
    }
  } catch {
    found = null;
  }
  teacherCache.set(cacheKey, found);
  return found;
}

const portraitCache = new Map<string, string | null>();

/** The teacher's workbook portrait as a data URL — the reference
 *  picture sent with a guidance image request, so the drawn teacher
 *  is the book's teacher and not an improvisation. The portraits
 *  live in lib/server/teachers/, one PNG per species. */
function teacherPortrait(species: string): string | null {
  if (portraitCache.has(species)) return portraitCache.get(species) ?? null;
  let found: string | null = null;
  try {
    const bytes = readFileSync(
      path.join(process.cwd(), "lib", "server", "teachers", `${species}.png`),
    );
    found = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    found = null;
  }
  portraitCache.set(species, found);
  return found;
}

/** The cache identity of one question's guidance image. The image
 *  goes with the guidance itself — drawn from one question's
 *  lesson and stored on that lesson's row — so the states map and
 *  the disk cache key on the question's own identity (the same
 *  triple the database row is matched on), never on the topic. */
function imageKeyFor(printedCode: string, questionNumber: number, keyVersion: number): string {
  return `${printedCode.toLowerCase()}-q${questionNumber}-kv${keyVersion}`;
}

function buildGuidanceImagePrompt(
  entry: RegistryEntry,
  topicTitle: string,
  anchorPrompt: string,
  anchorAnswer: string,
  guidanceHtml: string,
): string {
  const teacher = teacherFor(entry, topicTitle);
  const hasPortrait = teacher ? teacherPortrait(teacher.species) != null : false;
  return [
    `Create ONE portrait printable guidance image for a Grade ${entry.kidGrade} math student: a still-picture version of the animated lesson below, for the topic "${topicTitle}".`,
    teacher
      ? hasPortrait
        ? `Include ${teacher.label} — the topic's teacher from the student's workbook — small in a corner of the top section, pointing at the lesson. The picture attached to this request is ${teacher.name} exactly as in the workbook: draw the teacher to match that picture — same animal, same colours, same simple flat cartoon style.`
        : `Include ${teacher.label} — the topic's teacher from the student's workbook — small in a corner of the top section, in a simple flat cartoon style, pointing at the lesson.`
      : `Include a friendly cartoon animal teacher, small in a corner of the top section, in a simple flat cartoon style, pointing at the lesson.`,
    `At the top, the title "${topicTitle.toUpperCase()}" — and nothing else above the steps.`,
    `Then explain the problem in 4 to 6 steps — as many as the lesson's method needs, and no more: separate boxes in a 2-column grid (2 rows for 4 steps, 3 rows for 5 or 6), numbered in reading order. The steps are the lesson's method, spread across the boxes in the lesson's order:`,
    `- Draw each step the way the lesson draws it — the lesson's numbers, boxes, arrows and diagrams, with the lesson's own short labels and one-line captions, and no other words. Do not add explanations or paragraphs. Like the lesson, the steps are mostly numbers and boxes, with very few words.`,
    `- If the lesson has fewer than 4 beats, split its working at its natural joints to reach 4 steps; if it has more than 6 beats, group neighbouring beats until it fits 6. The last step ends with the lesson's final answer.`,
    `- If the lesson shows a wrong step, keep it shown and marked wrong the way the lesson marks it.`,
    `- Leave out the lesson's Next and Play buttons — they belong to the animation only.`,
    `This lesson works the workbook question: "${anchorPrompt}" (correct answer: ${anchorAnswer}). The image is the lesson only — no practice questions, and nothing else below the steps.`,
    `Every number and every calculation on the image must be exactly right — check each one before rendering it. Any picture, grid, array, or diagram must show EXACTLY what the words beside it say: a rectangle labelled length 6 and width 5 is drawn with exactly 6 squares across and 5 rows down — count the rows and columns before finishing, because a picture that disagrees with its numbers teaches the wrong lesson.`,
    `Style: dark brown-black text on a warm cream background (#fff8ec), orange (#e8710a) accents, rounded corners, simple flat illustration, large clear lettering a young student can read.`,
    `Print rule: the image must stay fully legible when printed in black and white — all meaning carried by the dark text and outlines; colour is decoration only. Keep fills pale, and never put light text on a coloured fill.`,
    `No buttons, no app controls, no logos, no watermarks. Portrait orientation.`,
    ``,
    `The lesson, as verified HTML — its numbers, steps and examples are right; follow it exactly:`,
    guidanceHtml,
  ].join("\n");
}

/* ----- the image API (Meta Responses shape) ----- */

interface ResponsesResult {
  output?: { type: string; result?: string }[];
}

/* Guidance image log lines take the guidance runs' shape — [guidance-image
 * CODE#Q +T] with T the seconds since the run was queued — so a
 * guidance image reads the same way in the server log as the lesson that
 * seeded it. The label is the seed question; the topic rides in
 * the message text. */
interface GuidanceImageRun {
  label: string;
  t0: number;
}

function guidanceImageLog(run: GuidanceImageRun, message: string): void {
  const elapsed = ((Date.now() - run.t0) / 1000).toFixed(1);
  console.log(`[guidance-image ${run.label} +${elapsed}s] ${message}`);
}

async function callResponses(
  config: PiConfig,
  providerId: string,
  body: Record<string, unknown>,
  stage: string,
  timeoutMs: number,
  log?: (message: string) => void,
): Promise<ResponsesResult> {
  const say = log ?? ((message: string) => console.log(`[guidance-image] ${message}`));
  const def = providerDef(config, providerId);
  if (!def) throw new Error(`No provider "${providerId}" is configured for guidance images.`);
  const key = resolveProviderApiKey(config, providerId);
  if (!key) {
    throw new Error(
      `No API key for provider "${providerId}" — set the key env var named in models.json (META_API_KEY / MODEL_API_KEY).`,
    );
  }
  // A slow stage is retried once before it may fail the image: the
  // image model reasons before it renders, and one timeout says
  // nothing about the image itself. Every error names its stage,
  // so the server log says where a run died.
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${def.baseUrl}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`Provider "${providerId}" answered HTTP ${res.status} during ${stage}.`);
      }
      const json = (await res.json()) as ResponsesResult;
      say(`${stage} answered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return json;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const timedOut =
        e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      if (timedOut && attempt === 0) {
        say(`${stage} timed out after ${Math.round(timeoutMs / 1000)}s; retrying once`);
        continue;
      }
      if (timedOut) {
        throw new Error(`${stage} timed out twice (limit ${Math.round(timeoutMs / 1000)}s per attempt).`);
      }
      if (message.startsWith("Provider ")) throw e;
      throw new Error(`${stage}: ${message}`);
    }
  }
}

function mimeOf(bytes: Buffer): string {
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF") return "image/webp";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return "image/webp";
}

function imageOf(result: ResponsesResult): { dataUrl: string } | null {
  const item = (result.output ?? []).find((o) => o.type === "image_generation_call" && o.result);
  if (!item?.result) return null;
  const bytes = Buffer.from(item.result, "base64");
  return { dataUrl: `data:${mimeOf(bytes)};base64,${item.result}` };
}

/* ----- storage: memory in flight, disk and database when ready ----- */

type GuidanceImageState =
  | { state: "working" }
  | { state: "ready"; dataUrl: string }
  | { state: "failed"; error: string };

// The state map lives on globalThis, like the grade jobs and the
// memory guidance store: Next loads this module once for the
// worker (instrumentation) and again for the route handlers, and
// a module-level map would give each copy its own state — the
// worker's run and the page's polls would track different runs of
// the same guidance image, each invisible to the other.
type GlobalWithGuidanceImages = typeof globalThis & { __guidanceImageStates?: Map<string, GuidanceImageState> };
const states: Map<string, GuidanceImageState> = ((globalThis as GlobalWithGuidanceImages).__guidanceImageStates ??= new Map());

function cacheDir(): string {
  const dir = path.join(process.cwd(), ".guidance-image-cache");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readDisk(key: string): string | null {
  try {
    const file = path.join(cacheDir(), `${key}.txt`);
    return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
  } catch {
    return null;
  }
}

function writeDisk(key: string, dataUrl: string): void {
  try {
    writeFileSync(path.join(cacheDir(), `${key}.txt`), dataUrl);
  } catch {
    // A failed cache write only costs a regeneration next boot.
  }
}

/* ----- the same image in the database ----- */

/** The image columns live on the seed question's row in
 *  guidance_animations — the row of the lesson the image was drawn
 *  from — with the topic key denormalized onto the row, so a
 *  topic's image is one indexed lookup rather than a scan of every
 *  sheet the topic appears in. Read and written with the
 *  service-role client, like the lessons: operator machinery, no
 *  parent data. Absent the client (demo without a service key, or
 *  the migration not yet pushed), the disk cache and memory remain
 *  the whole store, exactly as before. */

type DbGuidanceImage = { state: "ready"; dataUrl: string } | { state: "failed"; error: string };

/* The sweep's terms, mirroring the lessons': a generation left at
 * generating longer than the longest possible request (two
 * attempts at the 420s timeout) belongs to a server that died
 * mid-draw, and a failed image retries after 5 minutes, then 30,
 * and stays failed at 3 attempts. */
const IMAGE_STALE_MS = 20 * 60_000;
const IMAGE_BACKOFF_MS = [5 * 60_000, 30 * 60_000];
const IMAGE_MAX_ATTEMPTS = 3;

let dbImageWarned = false;

/** Read one question's own image from its guidance row — the row
 *  is matched on the same triple as the lesson itself. A row still
 *  generating answers null: only ready and failed settle a read. */
async function dbLoadImage(
  printedCode: string,
  questionNumber: number,
  keyVersion: number,
): Promise<DbGuidanceImage | null> {
  const admin = supabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("guidance_animations")
      .select("image_status, image_data_url, image_error")
      .match({ printed_code: printedCode, question_number: questionNumber, key_version: keyVersion })
      .maybeSingle();
    if (error) {
      if (!dbImageWarned) {
        dbImageWarned = true;
        console.warn(
          `[guidance-image] database read unavailable — ${error.message}; using disk and memory only`,
        );
      }
      return null;
    }
    const row = data as {
      image_status: string | null;
      image_data_url: string | null;
      image_error: string | null;
    } | null;
    if (row?.image_status === "ready" && row.image_data_url) {
      return { state: "ready", dataUrl: row.image_data_url };
    }
    if (row?.image_status === "failed") {
      return { state: "failed", error: row.image_error ?? "The guidance image could not be drawn." };
    }
    return null;
  } catch {
    return null;
  }
}

/** Settle a question's in-memory state from its own row's database
 *  image, if it has one: ready is adopted (and written through to
 *  the disk cache), failed is adopted as failed. Returns "settled"
 *  when the database answered the question one way or the other. */
async function settleFromDatabase(
  key: string,
  printedCode: string,
  questionNumber: number,
  keyVersion: number,
  topicTitle: string,
): Promise<"settled" | "none"> {
  const db = await dbLoadImage(printedCode, questionNumber, keyVersion);
  if (!db) return "none";
  if (db.state === "ready") {
    writeDisk(key, db.dataUrl);
    states.set(key, { state: "ready", dataUrl: db.dataUrl });
    guidanceImageLog(
      { label: `${printedCode}#${questionNumber}`, t0: Date.now() },
      `guidance image ready — database, topic "${topicTitle}"`,
    );
  } else {
    states.set(key, { state: "failed", error: db.error });
  }
  return "settled";
}

async function dbSaveImage(
  printedCode: string,
  questionNumber: number,
  keyVersion: number,
  status: "generating" | "ready" | "failed",
  dataUrl: string | null,
  errorText: string | null,
  log: (message: string) => void,
): Promise<void> {
  const admin = supabaseAdmin();
  if (!admin) return;
  try {
    const fields: Record<string, unknown> = {
      image_status: status,
      image_data_url: dataUrl,
      image_error: errorText,
      image_updated_at: new Date().toISOString(),
    };
    if (status === "failed") {
      // A failure consumes an attempt, as with the lessons; the
      // sweep's backoff and bound read the count back off the row.
      const { data } = await admin
        .from("guidance_animations")
        .select("image_attempts")
        .match({ printed_code: printedCode, question_number: questionNumber, key_version: keyVersion })
        .maybeSingle();
      const attempts = (data as { image_attempts?: number } | null)?.image_attempts;
      if (typeof attempts === "number") fields.image_attempts = attempts + 1;
    }
    const { error } = await admin
      .from("guidance_animations")
      .update(fields)
      .match({ printed_code: printedCode, question_number: questionNumber, key_version: keyVersion });
    if (error) log(`guidance image database save failed — ${error.message}`);
    // No matching row is silent: the seed row went away between
    // the lesson finishing and this save; the disk cache still
    // holds the image for this server. Saves only happen at all
    // for lessons that live in the database — a demo lesson's
    // image never reaches this function.
  } catch (e) {
    log(`guidance image database save failed — ${e instanceof Error ? e.message : String(e)}`);
  }
}

interface SweepRow {
  id: string;
  printed_code: string;
  question_number: number;
  key_version: number;
  html: string;
  image_status: string | null;
  image_attempts: number | null;
  image_updated_at: string | null;
}

function sweepEligible(row: SweepRow, now: number): boolean {
  if (row.image_status === null) return true; // the lesson finished; the image never started
  const updated = row.image_updated_at ? Date.parse(row.image_updated_at) : 0;
  if (row.image_status === "generating") return now - updated > IMAGE_STALE_MS;
  if (row.image_status === "failed") {
    const attempts = row.image_attempts ?? 0;
    if (attempts >= IMAGE_MAX_ATTEMPTS) return false;
    const wait = IMAGE_BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), IMAGE_BACKOFF_MS.length - 1)];
    return now - updated > wait;
  }
  return false; // ready is terminal
}

/**
 * Re-run the guidance images a crash left unfinished — the image
 * half of the guidance worker's durability. The lesson rows are
 * the queue: a ready lesson whose seed row has no image, a stale
 * generating image, or a failed image past its backoff is claimed
 * by compare-and-swap on the row (the expected status and timestamp
 * ride in the update's match, so two workers cannot take the same
 * row) and started again from the lesson's stored HTML. Bounded
 * per call so a backlog drains over successive polls instead of
 * bursting. Returns how many runs it started.
 */
export async function sweepGuidanceImages(limit = 2): Promise<number> {
  const admin = supabaseAdmin();
  if (!admin) return 0;
  try {
    const { data, error } = await admin
      .from("guidance_animations")
      .select(
        "id, printed_code, question_number, key_version, html, image_status, image_attempts, image_updated_at",
      )
      .eq("status", "ready")
      .not("html", "is", null)
      .order("image_updated_at", { ascending: true, nullsFirst: true })
      .limit(100);
    if (error || !data) return 0;
    const now = Date.now();
    // Each row is its own candidate: an image goes with its own
    // guidance, so one question's finished image says nothing
    // about another's — eligibility is read off the row itself.
    let started = 0;
    for (const row of data as SweepRow[]) {
      if (started >= limit) break;
      if (!sweepEligible(row, now)) continue;
      const entry = findByPrintedCode(row.printed_code);
      const question = entry?.questions.find((q) => q.number === row.question_number);
      if (!entry || !question) continue;
      const topicTitle = question.topic || entry.topic;
      const key = imageKeyFor(row.printed_code, row.question_number, row.key_version);
      const current = states.get(key);
      if (current?.state === "working" || current?.state === "ready") continue;
      let claim = admin
        .from("guidance_animations")
        .update({
          image_status: "generating",
          image_updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      claim =
        row.image_status === null
          ? claim.is("image_status", null)
          : claim.eq("image_status", row.image_status);
      claim =
        row.image_updated_at === null
          ? claim.is("image_updated_at", null)
          : claim.eq("image_updated_at", row.image_updated_at);
      const { data: claimed, error: claimError } = await claim.select("id");
      if (claimError || !claimed || claimed.length === 0) continue;
      if (current?.state === "failed") states.delete(key);
      guidanceImageLog(
        { label: `${row.printed_code}#${row.question_number}`, t0: Date.now() },
        `guidance image sweep — re-running topic "${topicTitle}" (was ${row.image_status ?? "never started"})`,
      );
      startGuidanceImageForQuestion(row.printed_code, row.question_number, row.html, "worker sweep", {
        persist: true,
      });
      started++;
    }
    return started;
  } catch {
    return 0;
  }
}

/** UI-test hook: when set, every guidance image request serves this image
 *  file as ready, so the Help-page surface can be exercised without
 *  a provider key. Never set in production. */
function fixtureGuidanceImage(): string | null {
  const file = process.env.GUIDANCE_IMAGE_FIXTURE_PATH;
  if (!file || !existsSync(file)) return null;
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

async function runGuidanceImage(
  key: string,
  entry: RegistryEntry,
  topicTitle: string,
  anchorPrompt: string,
  anchorAnswer: string,
  guidanceHtml: string,
  run: GuidanceImageRun,
  printedCode: string,
  questionNumber: number,
  persist: boolean,
): Promise<void> {
  const config = loadPiConfig();
  const providerId = imageProviderId(config);
  const model = imageModelId(config);
  const prompt = buildGuidanceImagePrompt(entry, topicTitle, anchorPrompt, anchorAnswer, guidanceHtml);
  const teacher = teacherFor(entry, topicTitle);
  const portrait = teacher ? teacherPortrait(teacher.species) : null;
  // With a portrait, the request becomes a message carrying the
  // prompt text plus the portrait as a reference picture; without
  // one it stays the plain text prompt it has always been.
  const input: unknown = portrait
    ? [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: portrait },
          ],
        },
      ]
    : prompt;
  const log = (message: string) => guidanceImageLog(run, message);
  log(
    `guidance image generation started — "${anchorPrompt}", model ${model} via ${providerId}, lesson ${guidanceHtml.length} chars, prompt ${prompt.length} chars${
      portrait && teacher
        ? `, teacher reference ${teacher.name} attached (${Math.round(portrait.length / 1024)} KB)`
        : ""
    }`,
  );
  if (persist) {
    void dbSaveImage(printedCode, questionNumber, entry.keyVersion, "generating", null, null, log);
  }
  try {
    // One request, and that is the whole pipeline: the lesson it
    // feeds on was verified before it finished, and the image
    // simply renders that lesson as a printable picture.
    const made = imageOf(
      await callResponses(config, providerId, { model, input }, "image generation", 420_000, log),
    );
    if (!made) throw new Error("The image provider returned no image.");
    writeDisk(key, made.dataUrl);
    states.set(key, { state: "ready", dataUrl: made.dataUrl });
    if (persist) {
      void dbSaveImage(printedCode, questionNumber, entry.keyVersion, "ready", made.dataUrl, null, log);
    }
    log(`guidance image generation finished — image ${Math.round(made.dataUrl.length / 1024)} KB`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    states.set(key, { state: "failed", error: message });
    if (persist) {
      void dbSaveImage(printedCode, questionNumber, entry.keyVersion, "failed", null, message, log);
    }
    log(`guidance image generation failed — ${message}`);
  }
}

/**
 * Start the guidance image for one question, unless it is already
 * running, ready, or failed. The caller supplies the question's
 * finished lesson HTML — the image is drawn from it — so this is
 * called by the guidance worker the moment a lesson passes its
 * gate, and by the read below once the lesson is ready. The image
 * goes with this question's guidance alone: another question in
 * the same topic gets its own, drawn from its own lesson.
 *
 * `persist` says the question's lesson lives in the database (a
 * live lesson): only then does the image read or write its
 * database copy. A demo lesson's image stays out of the database
 * entirely — memory and the disk cache are its only homes — so
 * demo activity can neither adopt a live question's stored image
 * nor overwrite one.
 */
export function startGuidanceImageForQuestion(
  printedCode: string,
  questionNumber: number,
  guidanceHtml: string,
  source: "lesson finished" | "help read" | "worker sweep" = "lesson finished",
  opts?: { persist?: boolean },
): void {
  const entry = findByPrintedCode(printedCode);
  const question = entry?.questions.find((q) => q.number === questionNumber);
  if (!entry || !question) return;
  if (fixtureGuidanceImage()) return;
  const persist = opts?.persist ?? false;
  const topicTitle = question.topic || entry.topic;
  const key = imageKeyFor(printedCode, questionNumber, entry.keyVersion);
  if (states.has(key)) return;
  const run: GuidanceImageRun = { label: `${printedCode}#${questionNumber}`, t0: Date.now() };
  const disk = readDisk(key);
  if (disk) {
    states.set(key, { state: "ready", dataUrl: disk });
    guidanceImageLog(run, `guidance image ready — disk cache, topic "${topicTitle}"`);
    if (source === "worker sweep" && persist) {
      // The sweep claimed this seed row because the database has
      // no finished image for the topic; a disk hit heals the row
      // instead of leaving the claim to go stale.
      void dbSaveImage(printedCode, questionNumber, entry.keyVersion, "ready", disk, null, (m) =>
        guidanceImageLog(run, m),
      );
    }
    return;
  }
  states.set(key, { state: "working" });
  guidanceImageLog(run, `guidance image queued — from ${source}, topic "${topicTitle}"`);
  void (async () => {
    try {
      // The database may already hold this topic's image — drawn on
      // another host, or before a restart the disk cache did not
      // survive. Adopt it instead of drawing a second one. Only a
      // database lesson's image looks: a demo start skips the
      // database entirely.
      const db = persist ? await dbLoadImage(printedCode, questionNumber, entry.keyVersion) : null;
      if (db?.state === "ready") {
        writeDisk(key, db.dataUrl);
        states.set(key, { state: "ready", dataUrl: db.dataUrl });
        guidanceImageLog(run, `guidance image ready — database, topic "${topicTitle}"`);
        return;
      }
      if (db?.state === "failed") {
        states.set(key, { state: "failed", error: db.error });
        guidanceImageLog(run, `guidance image failed — database, topic "${topicTitle}"`);
        return;
      }
      await runGuidanceImage(
        key,
        entry,
        topicTitle,
        question.prompt,
        question.correctAnswer,
        guidanceHtml,
        run,
        printedCode,
        questionNumber,
        persist,
      );
    } catch (e) {
      // runGuidanceImage settles its own API failures; this catch is
      // for a throw before that try — config or prompt building —
      // which must still settle the topic instead of leaving it
      // working forever in this process.
      const message = e instanceof Error ? e.message : String(e);
      states.set(key, { state: "failed", error: message });
      if (persist) {
        void dbSaveImage(printedCode, questionNumber, entry.keyVersion, "failed", null, message, (m) =>
          guidanceImageLog(run, m),
        );
      }
      guidanceImageLog(run, `guidance image generation failed — ${message}`);
    }
  })();
}

/**
 * The guidance image for one question. The worker normally
 * starts it when the question's lesson finishes; a read starts it
 * too once that lesson is ready (sheets graded before guidance
 * images fed on lessons), and reports generating while the lesson
 * is still being made. The client polls while the status is
 * generating. Live callers are served the image only when their
 * account has a submission for the sheet, mirroring the guidance
 * route — the image is generic, but it belongs to that sheet's
 * help page.
 */
export async function getGuidanceImage(
  printedCode: string,
  questionNumber: number,
  auth: { token: string } | null,
): Promise<GuidanceImageRead> {
  const entry = findByPrintedCode(printedCode);
  const question = entry?.questions.find((q) => q.number === questionNumber);
  if (!entry || !question) return { kind: "unknown" };

  const fixture = fixtureGuidanceImage();
  if (fixture) return { kind: "ok", view: { status: "ready", image: fixture } };

  // The question's own topic, not the sheet's: a review sheet mixes
  // topics, and its questions still belong to one topic each.
  // A failed guidance image is not retried on view; the worker's
  // sweep owns retries, on the lessons' backoff terms.
  const topicTitle = question.topic || entry.topic;
  const key = imageKeyFor(printedCode, questionNumber, entry.keyVersion);
  if (!states.has(key)) {
    const disk = readDisk(key);
    if (disk) {
      states.set(key, { state: "ready", dataUrl: disk });
      guidanceImageLog(
        { label: `${printedCode}#${questionNumber}`, t0: Date.now() },
        `guidance image ready — disk cache, topic "${topicTitle}"`,
      );
    } else {
      // The lesson store decides the caller's world, as it does for
      // the lessons themselves: only a database lesson's image may
      // settle from (or start into) the database — a demo read
      // never touches it.
      const dbStore = dbGuidanceStore();
      const store = auth !== null ? (dbStore ?? memoryGuidanceStore()) : memoryGuidanceStore();
      const persist = dbStore !== null && store === dbStore;
      if (
        persist &&
        (await settleFromDatabase(key, printedCode, questionNumber, entry.keyVersion, topicTitle)) === "settled"
      ) {
        // The topic's state came from the database; fall through to
        // the state read below.
      } else {
        // The guidance image waits for the question's lesson: it is drawn
        // from that HTML, so until the lesson is ready there is
        // nothing to draw from, and if the lesson failed there
        // never will be.
        const lesson = await store.get(printedCode, questionNumber, entry.keyVersion);
        if (lesson?.status === "ready" && lesson.html) {
          startGuidanceImageForQuestion(printedCode, questionNumber, lesson.html, "help read", { persist });
        } else if (lesson?.status === "failed") {
          return {
            kind: "ok",
            view: {
              status: "failed",
              error: "The lesson for this question could not be made, so no guidance image was drawn.",
            },
          };
        }
      }
    }
  }
  const current = states.get(key) ?? { state: "working" as const };

  const view: GuidanceImageView =
    current.state === "ready"
      ? { status: "ready", image: current.dataUrl }
      : current.state === "failed"
        ? { status: "failed", error: current.error }
        : { status: "generating" };

  if (auth && view.status === "ready") {
    const db = supabaseForToken(auth.token);
    const { data } = db
      ? await db.from("submissions").select("id").eq("sheet_code", printedCode).limit(1)
      : { data: null };
    if (!data || data.length === 0) return { kind: "forbidden" };
  }
  return { kind: "ok", view };
}
