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
 * A poster is drawn FROM the question's finished animated lesson:
 * the worker starts it the moment a lesson passes its gate, feeding
 * the lesson's HTML to the image model, so the poster teaches the
 * same concept with the same verified numbers instead of inventing
 * its own. No finished lesson, no poster.
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

async function callResponses(
  config: PiConfig,
  providerId: string,
  body: Record<string, unknown>,
  stage: string,
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
      console.log(`[poster] ${stage} answered in ${Math.round((Date.now() - t0) / 1000)}s`);
      return json;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const timedOut =
        e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      if (timedOut && attempt === 0) {
        console.log(`[poster] ${stage} timed out after ${Math.round(timeoutMs / 1000)}s; retrying once`);
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
 * Every plain calculation statement ("400 + 50 + 8 = 458"),
 * re-done in code: the WHOLE left-hand side is evaluated, with the
 * usual precedence. A statement that is not a bare calculation is
 * left to the vision verdict — code judges only what it can parse
 * completely, because a partial parse once condemned a correct
 * three-term sum by reading only its last two terms. Exported for
 * the out-of-repo test suite, which feeds it known-good and
 * known-bad statements.
 */
export function arithmeticProblems(statements: string[]): string[] {
  const problems: string[] = [];
  for (const raw of statements) {
    const judged = judgeStatement(raw);
    if (judged === null) continue;
    if (!judged.ok) {
      problems.push(`"${raw.trim()}" is wrong — it should be ${judged.want}`);
    }
  }
  return problems;
}

/** Evaluate "expr = number" exactly; null when the statement is
 *  not a bare calculation (words, arrows, units, a trailing mark
 *  code cannot account for). */
function judgeStatement(raw: string): { ok: boolean; want: string } | null {
  const cleaned = raw.replace(/,/g, "").replace(/[✓✗]\s*$/g, "").trim();
  const m = cleaned.match(/^(.+?)\s*=\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const tokens = tokenizeExpression(m[1]);
  if (!tokens) return null;
  const value = evaluateTokens(tokens);
  if (value === null) return null;
  const rhs = Number(m[2]);
  const want = Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  return { ok: Math.abs(value - rhs) < 1e-9, want };
}

type Token = { n: number } | { op: "+" | "-" | "*" | "/" };

function tokenizeExpression(expr: string): Token[] | null {
  const normalized = expr.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  const parts = normalized.match(/\d+(?:\.\d+)?|[+\-*/x]/g);
  if (!parts || parts.join("").replace(/\s/g, "") !== normalized.replace(/\s/g, "")) return null;
  const tokens: Token[] = [];
  for (const part of parts) {
    if (/^\d/.test(part)) tokens.push({ n: Number(part) });
    else if (part === "x") tokens.push({ op: "*" });
    else tokens.push({ op: part as "+" | "-" | "*" | "/" });
  }
  // A leading minus belongs to the first number.
  if (tokens.length >= 2 && "op" in tokens[0] && tokens[0].op === "-" && "n" in tokens[1]) {
    tokens.splice(0, 2, { n: -tokens[1].n });
  }
  // The stream must alternate number, op, number, … and end on a number.
  if (tokens.length < 3 || tokens.length % 2 === 0) return null;
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0 && !("n" in tokens[i])) return null;
    if (i % 2 === 1 && !("op" in tokens[i])) return null;
  }
  return tokens;
}

function evaluateTokens(tokens: Token[]): number | null {
  // First pass collapses × and ÷, second pass + and −.
  const collapsed: Token[] = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = (tokens[i] as { op: "+" | "-" | "*" | "/" }).op;
    const rhs = (tokens[i + 1] as { n: number }).n;
    if (op === "*" || op === "/") {
      const lhs = (collapsed[collapsed.length - 1] as { n: number }).n;
      if (op === "/" && rhs === 0) return null;
      collapsed[collapsed.length - 1] = { n: op === "*" ? lhs * rhs : lhs / rhs };
    } else {
      collapsed.push(tokens[i], tokens[i + 1]);
    }
  }
  let value = (collapsed[0] as { n: number }).n;
  for (let i = 1; i < collapsed.length; i += 2) {
    const op = (collapsed[i] as { op: "+" | "-" }).op;
    const rhs = (collapsed[i + 1] as { n: number }).n;
    value = op === "+" ? value + rhs : value - rhs;
  }
  return value;
}

interface PosterCheck {
  ok: boolean;
  /** How many calculations the vision pass transcribed from the
   *  poster (all of them re-verified in code). */
  statements: number;
  /** Hard failures: a calculation code re-did and got wrong, or a
   *  factual gate (labels, practice count, answers shown, white
   *  background). Only these send a poster back or keep it hidden. */
  problems: string[];
  /** The vision model's free-text critiques. Presentation
   *  opinions — a step numbered oddly, a cramped panel — are
   *  logged for a human's eye but never block a poster whose
   *  facts check out. */
  warnings: string[];
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
    `{"statements": ["every calculation written on the poster, copied exactly, like \\"300 + 100 = 400\\""], "correctExampleLabelled": true/false (the correct example is clearly marked correct), "incorrectExampleLabelledWrong": true/false (the incorrect example is clearly marked wrong AND its mistake is the one the poster names), "picturesMatchNumbers": true/false (every drawn picture, grid, or diagram shows exactly the quantities the words beside it state — count the squares in any grid: a rectangle labelled length 6, width 5 must be drawn 6 across and 5 down), "practiceCount": the number of practice questions in the bottom section, "practiceAnswersShown": true/false (any of the practice questions has its answer written anywhere, including a practice question that repeats a worked example's numbers), "practiceSound": true/false (every practice question is answerable as printed — the numbers given inside it follow the rule the question itself states, so a starting sequence counted by 50s really does go up by 50 each step), "practiceBackgroundWhite": true/false (the practice section background is white), "problems": ["each wrong calculation, mislabelled example, or unclear item you find, in your own words"]}`,
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
    "vision check",
    240_000,
  );
  const text = textOf(result);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, statements: 0, problems: ["the vision check could not read the poster"], warnings: [] };
  }
  let verdict: {
    statements?: string[];
    correctExampleLabelled?: boolean;
    incorrectExampleLabelledWrong?: boolean;
    picturesMatchNumbers?: boolean;
    practiceCount?: number;
    practiceAnswersShown?: boolean;
    practiceSound?: boolean;
    practiceBackgroundWhite?: boolean;
    problems?: string[];
  };
  try {
    verdict = JSON.parse(text.slice(start, end + 1)) as typeof verdict;
  } catch {
    return { ok: false, statements: 0, problems: ["the vision check could not read the poster"], warnings: [] };
  }
  const problems: string[] = [...arithmeticProblems(verdict.statements ?? [])];
  if (verdict.correctExampleLabelled !== true) problems.push("the correct example is not clearly marked correct");
  if (verdict.incorrectExampleLabelledWrong !== true) problems.push("the incorrect example is not clearly marked wrong with its mistake named");
  if (verdict.picturesMatchNumbers !== true) problems.push("a drawn picture does not match the numbers stated beside it — redraw it with exactly the stated quantities");
  if (verdict.practiceCount !== 5) problems.push(`the practice section holds ${verdict.practiceCount ?? 0} questions, not 5`);
  if (verdict.practiceAnswersShown === true) problems.push("a practice question's answer is shown");
  if (verdict.practiceSound !== true) problems.push("a practice question's given numbers break the rule it states — fix the givens so the question can be answered");
  if (verdict.practiceBackgroundWhite !== true) problems.push("the practice section background is not white");
  return {
    ok: problems.length === 0,
    statements: (verdict.statements ?? []).length,
    problems,
    warnings: verdict.problems ?? [],
  };
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
  guidanceHtml: string,
  questionNumber: number,
): Promise<void> {
  const config = loadPiConfig();
  const providerId = imageProviderId(config);
  const model = imageModelId(config);
  const prompt = buildPosterPrompt(entry, topicTitle, anchorPrompt, anchorAnswer, guidanceHtml);
  const t0 = Date.now();
  const total = () => `${Math.round((Date.now() - t0) / 1000)}s`;
  console.log(
    `[poster] ${key}: generating — anchor ${entry.printedCode}#${questionNumber} "${anchorPrompt}", model ${model} via ${providerId}, lesson ${guidanceHtml.length} chars, prompt ${prompt.length} chars`,
  );
  try {
    let made = imageOf(await callResponses(config, providerId, { model, input: prompt }, "image generation", 420_000));
    if (!made) throw new Error("The image provider returned no image.");
    let check = await checkPoster(config, made.dataUrl, entry, topicTitle);
    if (check.warnings.length > 0) {
      console.log(`[poster] ${key}: check notes, not blocking: ${check.warnings.join("; ")}`);
    }
    if (check.ok) {
      console.log(`[poster] ${key}: check passed — ${check.statements} calculations transcribed and re-verified`);
    }
    if (!check.ok) {
      console.log(`[poster] ${key}: check failed (${check.problems.join("; ")}); sending back for fixes`);
      const fix = `Fix ONLY these problems in the poster and keep everything else the same: ${check.problems.join("; ")}.`;
      let fixed: { dataUrl: string; responseId?: string } | null = null;
      if (made.responseId) {
        console.log(`[poster] ${key}: fix pass — chained edit of the first drawing`);
        try {
          fixed = imageOf(
            await callResponses(config, providerId, { model, previous_response_id: made.responseId, input: fix }, "poster fix", 420_000),
          );
        } catch (e) {
          console.log(`[poster] ${key}: chained edit failed (${e instanceof Error ? e.message : e}); regenerating with the corrections instead`);
          fixed = null;
        }
      }
      if (!fixed) {
        console.log(`[poster] ${key}: fix pass — regenerate with corrections`);
        fixed = imageOf(
          await callResponses(config, providerId, { model, input: `${prompt}\nAvoid these mistakes: ${check.problems.join("; ")}.` }, "image generation", 420_000),
        );
      }
      if (!fixed) throw new Error("The image provider returned no image on the fix pass.");
      made = fixed;
      check = await checkPoster(config, made.dataUrl, entry, topicTitle);
      if (check.warnings.length > 0) {
        console.log(`[poster] ${key}: check notes after the fix pass, not blocking: ${check.warnings.join("; ")}`);
      }
      if (check.ok) {
        console.log(`[poster] ${key}: check passed after the fix pass — ${check.statements} calculations transcribed and re-verified`);
      }
      if (!check.ok) {
        states.set(key, { state: "failed", error: check.problems.join("; ") });
        console.log(`[poster] ${key}: failed after the fix pass (${check.problems.join("; ")}); total ${total()}`);
        return;
      }
    }
    writeDisk(key, made.dataUrl);
    states.set(key, { state: "ready", dataUrl: made.dataUrl });
    console.log(`[poster] ${key}: ready (total ${total()}, image ${Math.round(made.dataUrl.length / 1024)} KB)`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    states.set(key, { state: "failed", error: message });
    console.log(`[poster] ${key}: failed (${message}); total ${total()}`);
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
  const disk = readDisk(key);
  if (disk) {
    states.set(key, { state: "ready", dataUrl: disk });
    console.log(`[poster] ${key}: ready from the disk cache`);
    return;
  }
  states.set(key, { state: "working" });
  console.log(`[poster] ${key}: queued from ${source} — ${printedCode}#${questionNumber}, topic "${topicTitle}"`);
  void runPoster(key, entry, topicTitle, question.prompt, question.correctAnswer, guidanceHtml, questionNumber);
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
      console.log(`[poster] ${key}: ready from the disk cache`);
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
