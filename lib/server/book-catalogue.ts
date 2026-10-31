/**
 * lib/server/book-catalogue.ts — registry entries for the printed books.
 *
 * The book generators freeze each grade's weekly assignment into
 * weekly_questions.json (every sheet already split, in packet order, with
 * its printed code). Copies live in lib/server/book-data/, organised by
 * region then subject (book-data/on/math/… — see its README). A v3 frozen
 * file holds refs into a sibling pools file instead of copies; the loader
 * resolves them at startup against the pools file its sha256 pin names.
 * This module discovers those folders and turns every frozen file into
 * registry entries so a photo of any real sheet grades against the
 * book's own answer key.
 *
 * Book entries are keyed by printed code. They are unbound — no kid is
 * attached at this layer; the client files each result under its own
 * kid of the sheet's grade.
 *
 * The books carry no per-question explanations, so a plain one is
 * synthesised from the prompt and answer; the generated guidance produced
 * during grading remains the real explanation for wrong answers.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { AnswerKeyQuestion } from "../store";
import type { AgentId, RegistryEntry } from "./registry";

const BOOK_KEY_VERSION = 1;

interface FrozenQuestion {
  body: string;
  answer: string;
  topic?: number;
}

interface FrozenSheet {
  code: string;
  questions: FrozenQuestion[];
  star?: { body: string; answer: string };
}

interface FrozenDoc {
  curriculum: string;
  subject: string;
  grade: number;
  version?: number;
  weeks: {
    week: number;
    topics: number[];
    practice: { topic: number; sheets: FrozenSheet[] }[];
    reviews: Record<string, { sheets: FrozenSheet[] }>;
  }[];
  finals: { sheets: FrozenSheet[] };
}

interface FrozenRef {
  topic: number;
  index: number;
}

interface FrozenSheetV3 {
  code: string;
  refs: (number | FrozenRef)[];
  star?: boolean;
}

interface FrozenDocV3 {
  curriculum: string;
  subject: string;
  grade: number;
  version: number;
  pools_sha256: string;
  weeks: {
    week: number;
    topics: number[];
    practice: { topic: number; sheets: FrozenSheetV3[] }[];
    reviews: Record<string, { sheets: FrozenSheetV3[] }>;
  }[];
  finals: { sheets: FrozenSheetV3[] };
}

type PoolsDoc = {
  num: number;
  title: string;
  questions: FrozenQuestion[];
  star: FrozenQuestion;
}[];

const DATA_DIR = path.join(process.cwd(), "lib", "server", "book-data");

/** One region/subject folder of frozen books. */
interface BookFolder {
  region: string;
  subject: string;
  dir: string;
  files: string[];
  topics: Record<string, Record<string, string>>;
}

function sortedDirNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Discover book-data/<region>/<subject>/ folders at startup, so a new
 *  region or subject is a new folder, never a code change. */
function discoverBookFolders(): BookFolder[] {
  const folders: BookFolder[] = [];
  for (const region of sortedDirNames(DATA_DIR)) {
    for (const subject of sortedDirNames(path.join(DATA_DIR, region))) {
      const dir = path.join(DATA_DIR, region, subject);
      let names: string[] = [];
      try {
        names = readdirSync(dir);
      } catch {
        continue;
      }
      const files = names.filter((f) => /^weekly-questions-g\d+\.json$/.test(f)).sort();
      if (files.length === 0) continue;
      // Topic titles live in the pools files — each topic record carries
      // its title — so no separate topic map exists to keep in sync.
      const topics: BookFolder["topics"] = {};
      for (const name of names) {
        const m = /^questions-g(\d+)\.json$/.exec(name);
        if (!m) continue;
        try {
          const pools = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as PoolsDoc;
          topics[m[1]] = Object.fromEntries(pools.map((t) => [String(t.num), t.title]));
        } catch {
          /* An unreadable pools file leaves its grade on the "Topic N"
             fallback; the frozen file's pin check is the hard failure
             for a broken pair. */
        }
      }
      folders.push({ region, subject, dir, files, topics });
    }
  }
  return folders;
}

/** A frozen file holds refs into a sibling pools file
 *  (questions-g{grade}.json), pinned by the pools file's sha256. Resolve
 *  it here, on the server, to the copy shape the registry builder
 *  consumes; a pin mismatch is a hard error, never a silent re-point.
 *  Only the v3 reference form is supported. */
function materializeDoc(folder: BookFolder, file: string, raw: FrozenDoc): FrozenDoc {
  if ((raw.version ?? 2) < 3) {
    throw new Error(
      `[book-data] ${file}: not in the v3 reference form — re-sync a frozen v3 file`,
    );
  }
  const v3 = raw as unknown as FrozenDocV3;
  const poolsFile = `questions-g${v3.grade}.json`;
  const poolsBytes = readFileSync(path.join(folder.dir, poolsFile));
  const digest = createHash("sha256").update(poolsBytes).digest("hex");
  if (digest !== v3.pools_sha256) {
    throw new Error(
      `[book-data] ${file}: ${poolsFile} does not match the frozen file's pools pin — re-sync the pair`,
    );
  }
  const pools = new Map(
    (JSON.parse(poolsBytes.toString("utf8")) as PoolsDoc).map((t) => [t.num, t]),
  );
  const poolQ = (topic: number, index: number): FrozenQuestion => {
    const q = pools.get(topic)?.questions[index];
    if (!q) throw new Error(`[book-data] ${file}: no pool question ${index} in topic ${topic}`);
    return { body: q.body, answer: q.answer };
  };
  const refQ = (ref: FrozenRef): FrozenQuestion => ({ ...poolQ(ref.topic, ref.index), topic: ref.topic });
  const reviewSheet = (s: FrozenSheetV3): FrozenSheet => ({
    code: s.code,
    questions: (s.refs as FrozenRef[]).map(refQ),
  });
  return {
    curriculum: v3.curriculum,
    subject: v3.subject,
    grade: v3.grade,
    weeks: v3.weeks.map((wk) => ({
      week: wk.week,
      topics: wk.topics,
      practice: wk.practice.map((blk) => ({
        topic: blk.topic,
        sheets: blk.sheets.map((s) => {
          const sheet: FrozenSheet = {
            code: s.code,
            questions: (s.refs as number[]).map((i) => poolQ(blk.topic, i)),
          };
          const star = pools.get(blk.topic)?.star;
          if (s.star && star) sheet.star = { body: star.body, answer: star.answer };
          return sheet;
        }),
      })),
      reviews: Object.fromEntries(
        Object.entries(wk.reviews).map(([kind, rv]) => [
          kind,
          { sheets: rv.sheets.map(reviewSheet) },
        ]),
      ),
    })),
    finals: { sheets: v3.finals.sheets.map(reviewSheet) },
  };
}

function loadDoc(folder: BookFolder, file: string): FrozenDoc {
  const doc = JSON.parse(readFileSync(path.join(folder.dir, file), "utf8")) as FrozenDoc;
  if (
    doc.curriculum?.toLowerCase() !== folder.region ||
    doc.subject?.toLowerCase() !== folder.subject
  ) {
    console.warn(
      `[book-data] ${folder.region}/${folder.subject}/${file} declares ` +
        `${doc.curriculum}/${doc.subject} — loading it as declared; keep the folder in sync.`,
    );
  }
  return materializeDoc(folder, file, doc);
}

function topicTitle(
  topics: BookFolder["topics"],
  grade: number,
  topic: number | undefined,
  fallback: string,
): string {
  if (topic === undefined) return fallback;
  return topics[String(grade)]?.[String(topic)] ?? fallback;
}

/** "MATH" → "Math" — the display subject used in labels. */
function displaySubject(subjectCode: string): string {
  const s = subjectCode.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Which grading agent serves a display subject. Mirrors registry.ts's
 *  AGENT_BY_SUBJECT (kept local to avoid a circular import); unknown
 *  subjects fall back to math, as there. */
function agentForSubject(display: string): AgentId {
  return display === "English" ? "english" : "math";
}

/** The printed question as plain text: picture markup removed, tags
 *  stripped, whitespace collapsed. Empty for purely visual questions —
 *  the photo is the ground truth there. */
function promptText(body: string): string {
  const noSvg = body.replace(/<svg[\s\S]*?<\/svg>/g, " ");
  const text = noSvg
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function explain(prompt: string, answer: string): string {
  if (/^[\d\s+\-−×x*÷/().]+$/.test(prompt) && prompt.length <= 24) {
    return `${prompt} = ${answer}.`;
  }
  return `The correct answer is ${answer}.`;
}

function keyQuestions(
  sheet: FrozenSheet,
  topics: BookFolder["topics"],
  grade: number,
  sheetTopic: string,
  isReview: boolean,
): AnswerKeyQuestion[] {
  // The Star Challenge prints on the last practice sheet but is not one
  // of its numbered questions, so it is not part of the key.
  return sheet.questions.map((q, i) => {
    const prompt = promptText(q.body);
    return {
      number: i + 1,
      prompt,
      correctAnswer: q.answer,
      explanation: explain(prompt, q.answer),
      topic: topicTitle(topics, grade, q.topic, sheetTopic),
      isReview,
    };
  });
}

const REVIEW_LABELS: Record<string, string> = {
  anchor: "Anchor Review",
  consolidation: "Consolidation Review",
  spiral: "Spiral Review",
  mixed: "Review Week",
};

function buildBookRegistry(): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  for (const folder of discoverBookFolders()) {
    for (const file of folder.files) {
      const doc = loadDoc(folder, file);
      const grade = doc.grade;
      const display = displaySubject(doc.subject);
      const base = {
        kidId: "",
        kidName: `Grade ${grade}`,
        kidGrade: grade,
        subject: display,
        agent: agentForSubject(display),
        keyVersion: BOOK_KEY_VERSION,
      };
      const push = (
        sheet: FrozenSheet,
        week: number,
        topic: string,
        isReview: boolean,
        setName?: string,
      ) => {
        entries.push({
          ...base,
          printedCode: sheet.code,
          sheetId: `book-${sheet.code.toLowerCase()}`,
          week,
          setName,
          topic,
          questions: keyQuestions(sheet, folder.topics, grade, topic, isReview),
        });
      };
      for (const week of doc.weeks) {
        for (const block of week.practice) {
          const title = topicTitle(folder.topics, grade, block.topic, `Topic ${block.topic}`);
          for (const sheet of block.sheets) push(sheet, week.week, title, false);
        }
        for (const [kind, review] of Object.entries(week.reviews)) {
          const label = REVIEW_LABELS[kind] ?? "Review";
          for (const sheet of review.sheets) push(sheet, week.week, label, true);
        }
      }
      for (const sheet of doc.finals.sheets) {
        push(sheet, 0, "Finals Spot-Check", true, "Finals");
      }
    }
  }
  return entries;
}

export const BOOK_REGISTRY: RegistryEntry[] = buildBookRegistry();
