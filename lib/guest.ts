/**
 * lib/guest.ts — guest mode's data lifecycle.
 *
 * `ensureGuestData` seeds the guest account (parent + Amy and Bob),
 * layers their book packets — Weeks 38, 39 and 40 of each kid's grade —
 * and seeds a marking history so the account opens the way a real one
 * looks mid-term: Weeks 38 and 39 fully marked for both kids, and two
 * of Amy's Week 40 sheets already marked (S21 with one wrong answer,
 * S22 with one answer waiting for a parent check). Everything is
 * insert-if-absent, so an existing guest account keeps whatever it has
 * scanned itself.
 */

import { GUEST_PACKET_KEYS, GUEST_PACKET_SHEETS } from "./book-guest-packets";
import {
  ensureSeeded,
  isGuestHistorySeeded,
  markGuestHistorySeeded,
  seedRecords,
  type AnswerKey,
  type GradeResult,
  type QuestionGrade,
  type Submission,
} from "./store";

export function ensureGuestData(): void {
  ensureSeeded();
  seedRecords({ sheets: GUEST_PACKET_SHEETS, answerKeys: GUEST_PACKET_KEYS });
  // The history goes in once: after that, what the account holds is
  // the parent's own state, and a removed sheet stays removed.
  if (!isGuestHistorySeeded()) {
    seedRecords(guestHistory());
    markGuestHistorySeeded();
  }
}

/* ------------------------------------------------------------ the history */

const DAY_MS = 24 * 60 * 60 * 1000;

function keyFor(sheetId: string): AnswerKey | undefined {
  return GUEST_PACKET_KEYS.find((k) => k.sheetId === sheetId);
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A plausible wrong read of a numeric answer — a nearby value, never
 * the answer itself. Non-numeric answers return null: history sheets
 * only slip on numbers, where a wrong read is easy to invent honestly.
 */
function wrongRead(correct: string, salt: number): string | null {
  if (!/^-?\d+(\.\d+)?$/.test(correct)) return null;
  const n = Number(correct);
  const delta = (salt % 5) + 1;
  return String(n >= 10 && salt % 2 === 0 ? n + delta * 10 : n + delta);
}

function correctGrade(key: AnswerKey): QuestionGrade[] {
  return key.questions.map((q) => ({
    questionNumber: q.number,
    verdict: "correct" as const,
    confidence: 0.98,
    readAnswer: q.correctAnswer,
    meta: { topic: q.topic },
  }));
}

function guestHistory(): { submissions: Submission[]; gradeResults: GradeResult[] } {
  const now = Date.now();
  const submissions: Submission[] = [];
  const gradeResults: GradeResult[] = [];
  const add = (sheetId: string, gradedAtMs: number, perQuestion: QuestionGrade[]) => {
    const code = sheetId.replace("book-", "");
    const subId = `guest-sub-${code}`;
    const gradedAt = new Date(gradedAtMs).toISOString();
    submissions.push({
      id: subId,
      sheetId,
      photoKeys: [],
      status: "graded",
      createdAt: new Date(gradedAtMs - 20 * 60 * 1000).toISOString(),
      gradedAt,
    });
    gradeResults.push({
      id: `guest-gr-${code}`,
      submissionId: subId,
      sheetId,
      perQuestion,
      gradedAt,
    });
  };

  // Weeks 38 and 39, fully marked: every answer right except a wrong
  // read or two per sheet, picked off the numeric answers. The packets
  // were marked in one sitting per kid per week, a few minutes apart.
  const sittings = new Map<string, number>();
  for (const sheet of GUEST_PACKET_SHEETS) {
    if (sheet.week !== 38 && sheet.week !== 39) continue;
    const key = keyFor(sheet.id);
    if (!key) continue;
    const salt = hashCode(sheet.printedCode);
    const wrongCount = key.questions.length <= 2 ? salt % 2 : salt % 3;
    const numeric = key.questions.filter((q) => wrongRead(q.correctAnswer, salt) !== null);
    const perQuestion = correctGrade(key);
    for (let i = 0; i < wrongCount && i < numeric.length; i++) {
      const q = numeric[Math.floor(((i + 0.5) * numeric.length) / Math.max(1, Math.min(wrongCount, numeric.length)))];
      const wrong = wrongRead(q.correctAnswer, salt);
      if (!wrong) continue;
      perQuestion[q.number - 1] = {
        questionNumber: q.number,
        verdict: "wrong",
        confidence: 0.94,
        readAnswer: wrong,
        meta: { topic: q.topic },
      };
    }
    const sittingKey = `${sheet.kidId}:${sheet.week}`;
    const sitting = sittings.get(sittingKey) ?? 0;
    sittings.set(sittingKey, sitting + 1);
    const base = sheet.week === 38 ? now - 12 * DAY_MS : now - 5 * DAY_MS;
    add(sheet.id, base + sitting * 47 * 60 * 1000, perQuestion);
  }

  // Amy's Spiral Review (1/3) for Week 40, marked this morning: the
  // estimate in Q1 kept an extra thousand (4070 for 1070); the rest is
  // right.
  const s21 = keyFor("book-on-math-g3-w40-s21");
  if (s21) {
    const perQuestion = correctGrade(s21);
    const q1 = s21.questions[0];
    perQuestion[0] = {
      questionNumber: q1.number,
      verdict: "wrong",
      confidence: 0.96,
      readAnswer: "4070",
      meta: {
        topic: q1.topic,
        guidance:
          "Round each number to the nearest 10 first: 477 rounds to 480 and 591 rounds to 590. " +
          "Then add: 480 + 590 = 1070. The answer written keeps an extra thousand. " +
          "Try one like it: estimate 382 + 497 (round to the nearest 10).",
      },
    };
    add(s21.sheetId, now - 3 * 60 * 60 * 1000, perQuestion);
  }

  // Amy's Spiral Review (2/3), marked after it: Q2's answer (636, for
  // 336) could not be read confidently, so it waits for a parent check.
  const s22 = keyFor("book-on-math-g3-w40-s22");
  if (s22) {
    const perQuestion = correctGrade(s22);
    const q2 = s22.questions[1];
    perQuestion[1] = {
      questionNumber: q2.number,
      verdict: "unsure",
      confidence: 0.55,
      readAnswer: "636",
      meta: { topic: q2.topic },
    };
    add(s22.sheetId, now - 2 * 60 * 60 * 1000, perQuestion);
  }

  return { submissions, gradeResults };
}
