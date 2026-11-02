/**
 * lib/server/guidance-poster.ts — the concept poster for a topic.
 *
 * Beside the animated lesson, a wrong answer can offer a printable
 * poster for the question's topic: four panels that explain the
 * concept (what it is, how it works, a correct example, an incorrect
 * example) and five fresh practice questions with blank answer lines
 * on a white section, drawn by the image model. One poster per topic
 * serves every kid and every question in it, so posters cache by
 * topic — on disk, so a restart keeps them.
 *
 * A poster is drawn FROM the question's finished animated lesson:
 * the worker starts it the moment a lesson passes its gate, feeding
 * the lesson's HTML to the image model, so the poster teaches the
 * same concept with the same verified numbers instead of inventing
 * its own. No finished lesson, no poster. One image request is the
 * whole pipeline — the poster is a rendering of an already-checked
 * lesson, so there is no second check and no fix pass after it.
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
import { supabaseForToken } from "./supabase";

interface PosterView {
  status: "generating" | "ready" | "failed";
  /** The poster as a data URL, when ready. */
  image?: string;
  error?: string;
}

type PosterRead =
  | { kind: "unknown" }
  | { kind: "forbidden" }
  | { kind: "ok"; view: PosterView };

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

const teacherCache = new Map<string, string | null>();

/** The topic's teacher ("Oliver Owl, a friendly cartoon owl"), read
 *  from the grade's pools file where topics carry their animal. */
function teacherFor(entry: RegistryEntry, topicTitle: string): string | null {
  const cacheKey = `${entry.kidGrade}|${topicTitle}`;
  if (teacherCache.has(cacheKey)) return teacherCache.get(cacheKey) ?? null;
  let found: string | null = null;
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
    const pools = JSON.parse(readFileSync(file, "utf8")) as {
      topics?: { title: string; animal: string }[];
    };
    const topic = (pools.topics ?? []).find((t) => t.title === topicTitle);
    if (topic && TEACHERS[topic.animal]) {
      found = `${TEACHERS[topic.animal]}, a friendly cartoon ${topic.animal}`;
    }
  } catch {
    found = null;
  }
  teacherCache.set(cacheKey, found);
  return found;
}

function posterKeyFor(entry: RegistryEntry, topicTitle: string): string {
  const slug = topicTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `g${entry.kidGrade}-${entry.subject.toLowerCase()}-${slug}`;
}

function buildPosterPrompt(
  entry: RegistryEntry,
  topicTitle: string,
  anchorPrompt: string,
  anchorAnswer: string,
  guidanceHtml: string,
): string {
  const teacher = teacherFor(entry, topicTitle);
  return [
    `Create ONE portrait educational poster for a Grade ${entry.kidGrade} math student. The topic is "${topicTitle}".`,
    teacher
      ? `Include ${teacher} — the topic's teacher from the student's workbook — small in a corner of the top section, in a simple flat cartoon style, pointing at the lesson.`
      : `Include a friendly cartoon animal teacher, small in a corner of the top section, in a simple flat cartoon style, pointing at the lesson.`,
    `Layout, top to bottom:`,
    `- A title "${topicTitle.toUpperCase()}" and one short subtitle line saying what the idea is.`,
    `- Four numbered panels in a 2 by 2 grid: 1 "What is ${topicTitle}?" in one or two plain sentences. 2 "How It Works" — the rule, with two or three short worked lines. 3 "Correct Example" — a fully worked example, every step right, clearly marked correct. 4 "Incorrect Example" — a worked example with one clear mistake, clearly marked wrong, with one line saying what went wrong.`,
    `- A bottom section "5 Sample Questions to Practice" with exactly 5 new practice questions about ${topicTitle}, numbered 1 to 5, each with a blank line for the student to write the answer. This section has a PURE WHITE background so a student can write on the printout. No answers to these 5 questions appear anywhere on the poster, and none of the 5 may reuse the worked examples' numbers — a practice question whose answer already appears in an example gives its answer away. Any numbers printed inside a practice question as givens must themselves be right: a starting sequence must follow its own counting rule exactly, or the question cannot be answered.`,
    `The poster is anchored on this workbook question: "${anchorPrompt}" (correct answer: ${anchorAnswer}). The examples must teach the same idea the same way.`,
    `Every number and every calculation on the poster must be exactly right — check each one before rendering it. Any picture, grid, array, or diagram must show EXACTLY what the words beside it say: a rectangle labelled length 6 and width 5 is drawn with exactly 6 squares across and 5 rows down — count the rows and columns before finishing, because a picture that disagrees with its numbers teaches the wrong lesson.`,
    `Style: dark brown-black text on a warm cream background (#fff8ec), orange (#e8710a) accents, rounded panel corners, simple flat illustration, large clear lettering a young student can read.`,
    `Print rule: the poster must stay fully legible when printed in black and white — all meaning carried by the dark text and outlines; colour is decoration only. Keep fills pale, and never put light text on a coloured fill.`,
    `No buttons, no app controls, no logos, no watermarks. Portrait orientation.`,
    ``,
    `Below is the verified animated lesson for this question, as HTML. It has already been checked: its numbers, steps, and examples are right. Teach the SAME concept the SAME way — the "What is" and "How It Works" panels explain what the lesson explains, the Correct Example is the correct working the lesson shows, and the Incorrect Example is the mistake the lesson highlights, with the same numbers throughout. Do not invent different numbers or a different example. The lesson's buttons and controls belong to the animation only — the poster is a still picture and shows none of them.`,
    guidanceHtml,
  ].join("\n");
}

/* ----- the image API (Meta Responses shape) ----- */

interface ResponsesResult {
  id?: string;
  output?: {
    type: string;
    result?: string;
    content?: { type: string; text?: string }[];
  }[];
}

/* Poster log lines take the guidance runs' shape — [poster
 * CODE#Q +T] with T the seconds since the run was queued — so a
 * poster reads the same way in the server log as the lesson that
 * seeded it. The label is the seed question; the topic rides in
 * the message text. */
interface PosterRun {
  label: string;
  t0: number;
}

function posterLog(run: PosterRun, message: string): void {
  const elapsed = ((Date.now() - run.t0) / 1000).toFixed(1);
  console.log(`[poster ${run.label} +${elapsed}s] ${message}`);
}

async function callResponses(
  config: PiConfig,
  providerId: string,
  body: Record<string, unknown>,
  stage: string,
  timeoutMs: number,
  log?: (message: string) => void,
): Promise<ResponsesResult> {
  const say = log ?? ((message: string) => console.log(`[poster] ${message}`));
  const def = providerDef(config, providerId);
  if (!def) throw new Error(`No provider "${providerId}" is configured for poster images.`);
  const key = resolveProviderApiKey(config, providerId);
  if (!key) {
    throw new Error(
      `No API key for provider "${providerId}" — set the key env var named in models.json (META_API_KEY / MODEL_API_KEY).`,
    );
  }
  // A slow stage is retried once before it may fail the poster: the
  // image model reasons before it renders, and one timeout says
  // nothing about the poster itself. Every error names its stage,
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

function imageOf(result: ResponsesResult): { dataUrl: string; responseId?: string } | null {
  const item = (result.output ?? []).find((o) => o.type === "image_generation_call" && o.result);
  if (!item?.result) return null;
  const bytes = Buffer.from(item.result, "base64");
  return { dataUrl: `data:${mimeOf(bytes)};base64,${item.result}`, responseId: result.id };
}

/* ----- storage: memory in flight, disk when ready ----- */

type PosterState =
  | { state: "working" }
  | { state: "ready"; dataUrl: string }
  | { state: "failed"; error: string };

// The state map lives on globalThis, like the grade jobs and the
// memory guidance store: Next loads this module once for the
// worker (instrumentation) and again for the route handlers, and
// a module-level map would give each copy its own state — the
// worker's run and the page's polls would track different runs of
// the same poster, each invisible to the other.
type GlobalWithPosters = typeof globalThis & { __posterStates?: Map<string, PosterState> };
const states: Map<string, PosterState> = ((globalThis as GlobalWithPosters).__posterStates ??= new Map());

function cacheDir(): string {
  const dir = path.join(process.cwd(), ".poster-cache");
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

/** UI-test hook: when set, every poster request serves this image
 *  file as ready, so the Help-page surface can be exercised without
 *  a provider key. Never set in production. */
function fixturePoster(): string | null {
  const file = process.env.POSTER_FIXTURE_PATH;
  if (!file || !existsSync(file)) return null;
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

async function runPoster(
  key: string,
  entry: RegistryEntry,
  topicTitle: string,
  anchorPrompt: string,
  anchorAnswer: string,
  guidanceHtml: string,
  run: PosterRun,
): Promise<void> {
  const config = loadPiConfig();
  const providerId = imageProviderId(config);
  const model = imageModelId(config);
  const prompt = buildPosterPrompt(entry, topicTitle, anchorPrompt, anchorAnswer, guidanceHtml);
  const log = (message: string) => posterLog(run, message);
  log(
    `poster generation started — "${anchorPrompt}", model ${model} via ${providerId}, lesson ${guidanceHtml.length} chars, prompt ${prompt.length} chars`,
  );
  try {
    // One request, and that is the whole pipeline: the lesson it
    // feeds on was verified before it finished, and the poster
    // simply renders that lesson as a printable picture.
    const made = imageOf(
      await callResponses(config, providerId, { model, input: prompt }, "image generation", 420_000, log),
    );
    if (!made) throw new Error("The image provider returned no image.");
    writeDisk(key, made.dataUrl);
    states.set(key, { state: "ready", dataUrl: made.dataUrl });
    log(`poster generation finished — image ${Math.round(made.dataUrl.length / 1024)} KB`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    states.set(key, { state: "failed", error: message });
    log(`poster generation failed — ${message}`);
  }
}

/**
 * Start the poster for one question's topic, unless it is already
 * running, ready, or failed. The caller supplies the question's
 * finished lesson HTML — the poster is drawn from it — so this is
 * called by the guidance worker the moment a lesson passes its
 * gate, and by the read below once the lesson is ready. Posters
 * are per topic, so several wrong questions in one topic start at
 * most one run, seeded by whichever lesson finished first.
 */
export function startPosterForQuestion(
  printedCode: string,
  questionNumber: number,
  guidanceHtml: string,
  source: "lesson finished" | "help read" = "lesson finished",
): void {
  const entry = findByPrintedCode(printedCode);
  const question = entry?.questions.find((q) => q.number === questionNumber);
  if (!entry || !question) return;
  if (fixturePoster()) return;
  const topicTitle = question.topic || entry.topic;
  const key = posterKeyFor(entry, topicTitle);
  if (states.has(key)) return;
  const run: PosterRun = { label: `${printedCode}#${questionNumber}`, t0: Date.now() };
  const disk = readDisk(key);
  if (disk) {
    states.set(key, { state: "ready", dataUrl: disk });
    posterLog(run, `poster ready — disk cache, topic "${topicTitle}"`);
    return;
  }
  states.set(key, { state: "working" });
  posterLog(run, `poster queued — from ${source}, topic "${topicTitle}"`);
  void runPoster(key, entry, topicTitle, question.prompt, question.correctAnswer, guidanceHtml, run);
}

/**
 * The poster for one question's topic. The worker normally starts
 * it when the question's lesson finishes; a read starts it too
 * once that lesson is ready (sheets graded before posters fed on
 * lessons), and reports generating while the lesson is still
 * being made. The client polls while the status is generating.
 * Live callers are served the image only when their account has a
 * submission for the sheet, mirroring the guidance route — the
 * poster is generic, but it belongs to that sheet's help page.
 */
export async function getPoster(
  printedCode: string,
  questionNumber: number,
  auth: { token: string } | null,
): Promise<PosterRead> {
  const entry = findByPrintedCode(printedCode);
  const question = entry?.questions.find((q) => q.number === questionNumber);
  if (!entry || !question) return { kind: "unknown" };

  const fixture = fixturePoster();
  if (fixture) return { kind: "ok", view: { status: "ready", image: fixture } };

  // The question's own topic, not the sheet's: a review sheet mixes
  // topics, and its questions still belong to one topic each.
  // A failed poster stays failed for this server run — like a
  // terminally failed guidance task, it is not retried on view.
  const topicTitle = question.topic || entry.topic;
  const key = posterKeyFor(entry, topicTitle);
  if (!states.has(key)) {
    const disk = readDisk(key);
    if (disk) {
      states.set(key, { state: "ready", dataUrl: disk });
      posterLog(
        { label: `${printedCode}#${questionNumber}`, t0: Date.now() },
        `poster ready — disk cache, topic "${topicTitle}"`,
      );
    } else {
      // The poster waits for the question's lesson: it is drawn
      // from that HTML, so until the lesson is ready there is
      // nothing to draw from, and if the lesson failed there
      // never will be.
      const store =
        auth !== null ? (dbGuidanceStore() ?? memoryGuidanceStore()) : memoryGuidanceStore();
      const lesson = await store.get(printedCode, questionNumber, entry.keyVersion);
      if (lesson?.status === "ready" && lesson.html) {
        startPosterForQuestion(printedCode, questionNumber, lesson.html, "help read");
      } else if (lesson?.status === "failed") {
        return {
          kind: "ok",
          view: {
            status: "failed",
            error: "The lesson for this question could not be made, so no poster was drawn.",
          },
        };
      }
    }
  }
  const current = states.get(key) ?? { state: "working" as const };

  const view: PosterView =
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
