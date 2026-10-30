/**
 * lib/server/book-catalogue.ts — registry entries for the printed books.
 *
 * The book generators freeze each grade's weekly assignment into
 * weekly_questions.json (every sheet already split, in packet order, with
 * its printed code). Copies live in lib/server/book-data/, organised by
 * region then subject (book-data/on/math/… — see its README). This
 * module discovers those folders and turns every frozen file into
 * registry entries so a photo of any real sheet grades against the
 * book's own answer key.
 *
 * Book entries are keyed by printed code like the seeded ones. A grade
 * with a seeded kid (Grade 4 → Gina) binds to that kid; other grades stay
 * unbound until a kid of that grade exists — the sheet still grades, the
 * client just has no record to file the result under yet.
 *
 * The books carry no per-question explanations, so a plain one is
 * synthesised from the prompt and answer; the generated guidance produced
 * during grading remains the real explanation for wrong answers.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { SEED_KIDS } from "../seed";
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
  weeks: {
    week: number;
    topics: number[];
    practice: { topic: number; sheets: FrozenSheet[] }[];
    reviews: Record<string, { sheets: FrozenSheet[] }>;
  }[];
  finals: { sheets: FrozenSheet[] };
}

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
      let topics: BookFolder["topics"] = {};
      try {
        topics = JSON.parse(readFileSync(path.join(dir, "topics.json"), "utf8")) as BookFolder["topics"];
      } catch {
        /* A subject without a topic map falls back to "Topic N" titles. */
      }
      folders.push({ region, subject, dir, files, topics });
    }
  }
  return folders;
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
  return doc;
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
      const kid = SEED_KIDS.find((k) => k.grade === grade);
      const display = displaySubject(doc.subject);
      const base = {
        kidId: kid?.id ?? "",
        kidName: kid?.name ?? `Grade ${grade}`,
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
