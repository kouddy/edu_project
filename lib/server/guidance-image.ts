/**
 * lib/server/guidance-image.ts — the concept poster for a topic.
 *
 * Beside the animated lesson, a wrong answer can offer a printable
 * poster for the question's topic: four panels that explain the
 * concept (what it is, how it works, a correct example, an incorrect
 * example) and five fresh practice questions with blank answer lines
 * on a white section, drawn by the image model. One poster per topic
 * serves every kid and every question in it, so posters cache by
 * topic — on disk, so a restart keeps them.
 *
 * An image model draws its numbers as pictures: nothing in a poster
 * can be checked the way the animation gate checks HTML. So a poster
 * reaches a kid only after a vision pass reads it back — every
 * calculation it states is transcribed and re-verified in code, the
 * correct/incorrect examples must be labelled as such, the practice
 * section must hold five unanswered questions on white. A failed
 * check sends the image back once with the problems named; a second
 * failure keeps the poster off the page entirely.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findByPrintedCode, type RegistryEntry } from "./registry";
import {
  effectiveModel,
  imageModelId,
  imageProviderId,
  loadPiConfig,
  providerDef,
  providerForAgent,
  resolveProviderApiKey,
  type PiConfig,
} from "./pi-config";
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
    `- A bottom section "5 Sample Questions to Practice" with exactly 5 new practice questions about ${topicTitle}, numbered 1 to 5, each with a blank line for the student to write the answer. This section has a PURE WHITE background so a student can write on the printout. No answers to these 5 questions appear anywhere on the poster.`,
    `The poster is anchored on this workbook question: "${anchorPrompt}" (correct answer: ${anchorAnswer}). The examples must teach the same idea the same way.`,
    `Every number and every calculation on the poster must be exactly right — check each one before rendering it.`,
    `Style: dark brown-black text on a warm cream background (#fff8ec), orange (#e8710a) accents, rounded panel corners, simple flat illustration, large clear lettering a young student can read.`,
    `Print rule: the poster must stay fully legible when printed in black and white — all meaning carried by the dark text and outlines; colour is decoration only. Keep fills pale, and never put light text on a coloured fill.`,
    `No buttons, no app controls, no logos, no watermarks. Portrait orientation.`,
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

async function callResponses(
  config: PiConfig,
  providerId: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<ResponsesResult> {
  const def = providerDef(config, providerId);
  if (!def) throw new Error(`No provider "${providerId}" is configured for poster images.`);
  const key = resolveProviderApiKey(config, providerId);
  if (!key) {
    throw new Error(
      `No API key for provider "${providerId}" — set the key env var named in models.json (META_API_KEY / MODEL_API_KEY).`,
    );
  }
  const res = await fetch(`${def.baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Image provider "${providerId}" answered HTTP ${res.status}.`);
  }
  return (await res.json()) as ResponsesResult;
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

function textOf(result: ResponsesResult): string {
  for (const item of result.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if ((part.type === "output_text" || part.type === "text") && part.text) return part.text;
    }
  }
  return "";
}

/* ----- the vision check ----- */

/**
 * Every plain "a op b = c" statement, re-done in code. Exported for
 * the out-of-repo test suite, which feeds it known-good and
 * known-bad statements.
 */
export function arithmeticProblems(statements: string[]): string[] {
  const problems: string[] = [];
  const re = /(-?\d[\d,]*(?:\.\d+)?)\s*([+\-−×x*÷/])\s*(-?\d[\d,]*(?:\.\d+)?)\s*=\s*(-?\d[\d,]*(?:\.\d+)?)/;
  for (const raw of statements) {
    const m = raw.replace(/,/g, "").match(re);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[3]);
    const c = Number(m[4]);
    const op = m[2];
    const want =
      op === "+" ? a + b : op === "-" || op === "−" ? a - b : op === "×" || op === "x" || op === "*" ? a * b : a / b;
    if (Math.abs(want - c) > 1e-9) {
      problems.push(`"${raw.trim()}" is wrong — it should be ${want}`);
    }
  }
  return problems;
}

interface PosterCheck {
  ok: boolean;
  problems: string[];
}

async function checkPoster(
  config: PiConfig,
  dataUrl: string,
  entry: RegistryEntry,
  topicTitle: string,
): Promise<PosterCheck> {
  const providerId = providerForAgent(config, "math");
  const model = effectiveModel(config, "math", providerId);
  const ask = [
    `You are checking a Grade ${entry.kidGrade} math poster about "${topicTitle}" before a child sees it. Read the poster image carefully and answer with ONLY a JSON object, no other text:`,
    `{"statements": ["every calculation written on the poster, copied exactly, like \\"300 + 100 = 400\\""], "correctExampleLabelled": true/false (the correct example is clearly marked correct), "incorrectExampleLabelledWrong": true/false (the incorrect example is clearly marked wrong AND its mistake is the one the poster names), "practiceCount": the number of practice questions in the bottom section, "practiceAnswersShown": true/false (any of the practice questions has its answer written anywhere), "practiceBackgroundWhite": true/false (the practice section background is white), "problems": ["each wrong calculation, mislabelled example, or unclear item you find, in your own words"]}`,
    `Judge the incorrect example by its label: a wrong calculation inside it is intended, but only when the poster marks it wrong and names that same mistake.`,
  ].join("\n");
  const result = await callResponses(
    config,
    providerId,
    {
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: ask },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
    },
    180_000,
  );
  const text = textOf(result);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, problems: ["the vision check could not read the poster"] };
  }
  let verdict: {
    statements?: string[];
    correctExampleLabelled?: boolean;
    incorrectExampleLabelledWrong?: boolean;
    practiceCount?: number;
    practiceAnswersShown?: boolean;
    practiceBackgroundWhite?: boolean;
    problems?: string[];
  };
  try {
    verdict = JSON.parse(text.slice(start, end + 1)) as typeof verdict;
  } catch {
    return { ok: false, problems: ["the vision check could not read the poster"] };
  }
  const problems: string[] = [...(verdict.problems ?? [])];
  problems.push(...arithmeticProblems(verdict.statements ?? []));
  if (verdict.correctExampleLabelled !== true) problems.push("the correct example is not clearly marked correct");
  if (verdict.incorrectExampleLabelledWrong !== true) problems.push("the incorrect example is not clearly marked wrong with its mistake named");
  if (verdict.practiceCount !== 5) problems.push(`the practice section holds ${verdict.practiceCount ?? 0} questions, not 5`);
  if (verdict.practiceAnswersShown === true) problems.push("a practice question's answer is shown");
  if (verdict.practiceBackgroundWhite !== true) problems.push("the practice section background is not white");
  return { ok: problems.length === 0, problems };
}

/* ----- storage: memory in flight, disk when ready ----- */

type PosterState =
  | { state: "working" }
  | { state: "ready"; dataUrl: string }
  | { state: "failed"; error: string };

const states = new Map<string, PosterState>();

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
): Promise<void> {
  const config = loadPiConfig();
  const providerId = imageProviderId(config);
  const model = imageModelId(config);
  const prompt = buildPosterPrompt(entry, topicTitle, anchorPrompt, anchorAnswer);
  try {
    let made = imageOf(await callResponses(config, providerId, { model, input: prompt }, 300_000));
    if (!made) throw new Error("The image provider returned no image.");
    let check = await checkPoster(config, made.dataUrl, entry, topicTitle);
    if (!check.ok) {
      console.log(`[poster] ${key}: check failed (${check.problems.join("; ")}); sending back for fixes`);
      const fix = `Fix ONLY these problems in the poster and keep everything else the same: ${check.problems.join("; ")}.`;
      let fixed: { dataUrl: string; responseId?: string } | null = null;
      if (made.responseId) {
        try {
          fixed = imageOf(
            await callResponses(config, providerId, { model, previous_response_id: made.responseId, input: fix }, 300_000),
          );
        } catch {
          fixed = null;
        }
      }
      if (!fixed) {
        fixed = imageOf(
          await callResponses(config, providerId, { model, input: `${prompt}\nAvoid these mistakes: ${check.problems.join("; ")}.` }, 300_000),
        );
      }
      if (!fixed) throw new Error("The image provider returned no image on the fix pass.");
      made = fixed;
      check = await checkPoster(config, made.dataUrl, entry, topicTitle);
      if (!check.ok) {
        states.set(key, { state: "failed", error: check.problems.join("; ") });
        console.log(`[poster] ${key}: failed after the fix pass (${check.problems.join("; ")})`);
        return;
      }
    }
    writeDisk(key, made.dataUrl);
    states.set(key, { state: "ready", dataUrl: made.dataUrl });
    console.log(`[poster] ${key}: ready`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    states.set(key, { state: "failed", error: message });
    console.log(`[poster] ${key}: failed (${message})`);
  }
}

/**
 * The poster for one question's topic. The first read starts
 * generation in the background; the client polls while the status
 * is generating. Live callers are served the image only when their
 * account has a submission for the sheet, mirroring the guidance
 * route — the poster is generic, but it belongs to that sheet's
 * help page.
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
  const topicTitle = question.topic || entry.topic;
  const key = posterKeyFor(entry, topicTitle);
  let current = states.get(key);
  if (!current) {
    const disk = readDisk(key);
    if (disk) {
      current = { state: "ready", dataUrl: disk };
      states.set(key, current);
    }
  }
  if (!current) {
    // A failed poster stays failed for this server run — like a
    // terminally failed guidance task, it is not retried on view.
    states.set(key, { state: "working" });
    void runPoster(key, entry, topicTitle, question.prompt, question.correctAnswer);
    current = { state: "working" };
  }

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
