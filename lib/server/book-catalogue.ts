/**
 * lib/server/book-catalogue.ts — registry entries for the printed books.
 *
 * The four book generators freeze each grade's weekly assignment into
 * weekly_questions.json (every sheet already split, in packet order, with
 * its printed code). Copies live in lib/server/book-data/ next to a topic
 * title map. This module turns them into registry entries so a photo of
 * any real sheet grades against the book's own answer key.
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

import { readFileSync } from "node:fs";
import path from "node:path";
import { SEED_KIDS } from "../seed";
import type { AnswerKeyQuestion } from "../store";
import type { RegistryEntry } from "./registry";

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

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
}

const TOPIC_TITLES = loadJson<Record<string, Record<string, string>>>("topics.json");

function topicTitle(grade: number, topic: number | undefined, fallback: string): string {
  if (topic === undefined) return fallback;
  return TOPIC_TITLES[String(grade)]?.[String(topic)] ?? fallback;
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
      topic: topicTitle(grade, q.topic, sheetTopic),
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
  for (const grade of [2, 3, 4, 5]) {
    const doc = loadJson<FrozenDoc>(`weekly-questions-g${grade}.json`);
    const kid = SEED_KIDS.find((k) => k.grade === grade);
    const base = {
      kidId: kid?.id ?? "",
      kidName: kid?.name ?? `Grade ${grade}`,
      kidGrade: grade,
      subject: "Math",
      agent: "math" as const,
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
        questions: keyQuestions(sheet, grade, topic, isReview),
      });
    };
    for (const week of doc.weeks) {
      for (const block of week.practice) {
        const title = topicTitle(grade, block.topic, `Topic ${block.topic}`);
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
  return entries;
}

export const BOOK_REGISTRY: RegistryEntry[] = buildBookRegistry();
