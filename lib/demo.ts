/**
 * lib/demo.ts — demo mode's data lifecycle.
 *
 * `ensureDemoData` seeds the demo account (parent + Amy and Bob),
 * layers their book packets — Weeks 38, 39 and 40 of each kid's grade —
 * and seeds a marking history so the account opens the way a real one
 * looks mid-term: Weeks 38 and 39 fully marked for both kids, and two
 * of Amy's Week 40 sheets already marked (S21 with one wrong answer,
 * S22 with one answer waiting for a parent check). Everything is
 * insert-if-absent, so an existing demo account keeps whatever it has
 * scanned itself.
 *
 * The packet records themselves (sheets + answer keys for Weeks 38–40)
 * are at the bottom of this file, so the whole demo dataset is in one
 * place. That section is generated from lib/server/book-data with the
 * same prompt/explanation rules the server registry uses, so a sheet
 * filed from this seed and the same sheet graded by the server agree —
 * regenerate it, don't hand-edit.
 */

import {
  ensureSeeded,
  isDemoHistorySeeded,
  markDemoHistorySeeded,
  seedRecords,
  type AnswerKey,
  type GradeResult,
  type QuestionGrade,
  type Sheet,
  type Submission,
} from "./store";

export function ensureDemoData(): void {
  ensureSeeded();
  seedRecords({ sheets: DEMO_PACKET_SHEETS, answerKeys: DEMO_PACKET_KEYS });
  // The history goes in once: after that, what the account holds is
  // the parent's own state, and a removed sheet stays removed.
  if (!isDemoHistorySeeded()) {
    seedRecords(demoHistory());
    markDemoHistorySeeded();
  }
}

/* ------------------------------------------------------------ the history */

const DAY_MS = 24 * 60 * 60 * 1000;

function keyFor(sheetId: string): AnswerKey | undefined {
  return DEMO_PACKET_KEYS.find((k) => k.sheetId === sheetId);
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

function demoHistory(): { submissions: Submission[]; gradeResults: GradeResult[] } {
  const now = Date.now();
  const submissions: Submission[] = [];
  const gradeResults: GradeResult[] = [];
  const add = (sheetId: string, gradedAtMs: number, perQuestion: QuestionGrade[]) => {
    const code = sheetId.replace("book-", "");
    const subId = `demo-sub-${code}`;
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
      id: `demo-gr-${code}`,
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
  for (const sheet of DEMO_PACKET_SHEETS) {
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

/* ------------------------------------------------------- packet records
 * Generated from lib/server/book-data (Weeks 38–40 of the Grade 3 and
 * Grade 4 frozen catalogues). Regenerate, don't hand-edit.
 */

const DEMO_PACKET_SHEETS: Sheet[] = [
  {
    "id": "book-on-math-g3-w38-s01",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S01",
    "topic": "Perimeter"
  },
  {
    "id": "book-on-math-g3-w38-s02",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S02",
    "topic": "Perimeter"
  },
  {
    "id": "book-on-math-g3-w38-s03",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S03",
    "topic": "Perimeter"
  },
  {
    "id": "book-on-math-g3-w38-s04",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S04",
    "topic": "Perimeter"
  },
  {
    "id": "book-on-math-g3-w38-s05",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S05",
    "topic": "Perimeter"
  },
  {
    "id": "book-on-math-g3-w38-s06",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S06",
    "topic": "Perimeter"
  },
  {
    "id": "book-on-math-g3-w38-s07",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S07",
    "topic": "Perimeter"
  },
  {
    "id": "book-on-math-g3-w38-s08",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S08",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g3-w38-s09",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S09",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g3-w38-s10",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S10",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g3-w38-s11",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S11",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g3-w38-s12",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S12",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g3-w38-s13",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S13",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g3-w38-s14",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G3-W38-S14",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g3-w39-s01",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S01",
    "topic": "Metric Length: mm, cm, m, km"
  },
  {
    "id": "book-on-math-g3-w39-s02",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S02",
    "topic": "Metric Length: mm, cm, m, km"
  },
  {
    "id": "book-on-math-g3-w39-s03",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S03",
    "topic": "Metric Length: mm, cm, m, km"
  },
  {
    "id": "book-on-math-g3-w39-s04",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S04",
    "topic": "Metric Length: mm, cm, m, km"
  },
  {
    "id": "book-on-math-g3-w39-s05",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S05",
    "topic": "Metric Length: mm, cm, m, km"
  },
  {
    "id": "book-on-math-g3-w39-s06",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S06",
    "topic": "Metric Length: mm, cm, m, km"
  },
  {
    "id": "book-on-math-g3-w39-s07",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S07",
    "topic": "Metric Length: mm, cm, m, km"
  },
  {
    "id": "book-on-math-g3-w39-s08",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S08",
    "topic": "Mass & Capacity"
  },
  {
    "id": "book-on-math-g3-w39-s09",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S09",
    "topic": "Mass & Capacity"
  },
  {
    "id": "book-on-math-g3-w39-s10",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S10",
    "topic": "Mass & Capacity"
  },
  {
    "id": "book-on-math-g3-w39-s11",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S11",
    "topic": "Mass & Capacity"
  },
  {
    "id": "book-on-math-g3-w39-s12",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S12",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g3-w39-s13",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S13",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g3-w39-s14",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S14",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g3-w39-s15",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S15",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g3-w39-s16",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S16",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g3-w39-s17",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S17",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g3-w39-s18",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S18",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g3-w39-s19",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G3-W39-S19",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g3-w40-s01",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S01",
    "topic": "Time: Analog & Digital Clocks"
  },
  {
    "id": "book-on-math-g3-w40-s02",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S02",
    "topic": "Time: Analog & Digital Clocks"
  },
  {
    "id": "book-on-math-g3-w40-s03",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S03",
    "topic": "Time: Analog & Digital Clocks"
  },
  {
    "id": "book-on-math-g3-w40-s04",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S04",
    "topic": "Time: Analog & Digital Clocks"
  },
  {
    "id": "book-on-math-g3-w40-s05",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S05",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g3-w40-s06",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S06",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g3-w40-s07",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S07",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g3-w40-s08",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S08",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g3-w40-s09",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S09",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g3-w40-s10",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S10",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g3-w40-s11",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S11",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g3-w40-s12",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S12",
    "topic": "Making Change"
  },
  {
    "id": "book-on-math-g3-w40-s13",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S13",
    "topic": "Making Change"
  },
  {
    "id": "book-on-math-g3-w40-s14",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S14",
    "topic": "Making Change"
  },
  {
    "id": "book-on-math-g3-w40-s15",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S15",
    "topic": "Making Change"
  },
  {
    "id": "book-on-math-g3-w40-s16",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S16",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g3-w40-s17",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S17",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g3-w40-s18",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S18",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g3-w40-s19",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S19",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g3-w40-s20",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S20",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g3-w40-s21",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S21",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g3-w40-s22",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S22",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g3-w40-s23",
    "kidId": "kid-amy",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G3-W40-S23",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w38-s01",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S01",
    "topic": "Classify Angles"
  },
  {
    "id": "book-on-math-g4-w38-s02",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S02",
    "topic": "Classify Angles"
  },
  {
    "id": "book-on-math-g4-w38-s03",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S03",
    "topic": "Classify Angles"
  },
  {
    "id": "book-on-math-g4-w38-s04",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S04",
    "topic": "Classify Angles"
  },
  {
    "id": "book-on-math-g4-w38-s05",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S05",
    "topic": "Classify Angles"
  },
  {
    "id": "book-on-math-g4-w38-s06",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S06",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g4-w38-s07",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S07",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g4-w38-s08",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S08",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g4-w38-s09",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S09",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g4-w38-s10",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S10",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w38-s11",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S11",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w38-s12",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 38,
    "printedCode": "ON-MATH-G4-W38-S12",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w39-s01",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S01",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g4-w39-s02",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S02",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g4-w39-s03",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S03",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g4-w39-s04",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S04",
    "topic": "Area of Rectangles"
  },
  {
    "id": "book-on-math-g4-w39-s05",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S05",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g4-w39-s06",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S06",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g4-w39-s07",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S07",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g4-w39-s08",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S08",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w39-s09",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S09",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w39-s10",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S10",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w39-s11",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 39,
    "printedCode": "ON-MATH-G4-W39-S11",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w40-s01",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S01",
    "topic": "Making Change & Money Choices"
  },
  {
    "id": "book-on-math-g4-w40-s02",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S02",
    "topic": "Making Change & Money Choices"
  },
  {
    "id": "book-on-math-g4-w40-s03",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S03",
    "topic": "Making Change & Money Choices"
  },
  {
    "id": "book-on-math-g4-w40-s04",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S04",
    "topic": "Making Change & Money Choices"
  },
  {
    "id": "book-on-math-g4-w40-s05",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S05",
    "topic": "Making Change & Money Choices"
  },
  {
    "id": "book-on-math-g4-w40-s06",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S06",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g4-w40-s07",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S07",
    "topic": "Anchor Review"
  },
  {
    "id": "book-on-math-g4-w40-s08",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S08",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g4-w40-s09",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S09",
    "topic": "Consolidation Review"
  },
  {
    "id": "book-on-math-g4-w40-s10",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S10",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w40-s11",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S11",
    "topic": "Spiral Review"
  },
  {
    "id": "book-on-math-g4-w40-s12",
    "kidId": "kid-bob",
    "subject": "Math",
    "week": 40,
    "printedCode": "ON-MATH-G4-W40-S12",
    "topic": "Spiral Review"
  }
];

const DEMO_PACKET_KEYS: AnswerKey[] = [
  {
    "sheetId": "book-on-math-g3-w38-s01",
    "questions": [
      {
        "number": 1,
        "prompt": "What is the perimeter ?",
        "correctAnswer": "20",
        "explanation": "The correct answer is 20.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "What is the perimeter ?",
        "correctAnswer": "24",
        "explanation": "The correct answer is 24.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "What is the perimeter ?",
        "correctAnswer": "26",
        "explanation": "The correct answer is 26.",
        "topic": "Perimeter",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s02",
    "questions": [
      {
        "number": 1,
        "prompt": "A square has sides of 8 cm . What is its perimeter ?",
        "correctAnswer": "32",
        "explanation": "The correct answer is 32.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A square has sides of 3 cm . What is its perimeter ?",
        "correctAnswer": "12",
        "explanation": "The correct answer is 12.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A triangle has sides 4 cm , 5 cm and 7 cm . What is its perimeter ?",
        "correctAnswer": "16",
        "explanation": "The correct answer is 16.",
        "topic": "Perimeter",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s03",
    "questions": [
      {
        "number": 1,
        "prompt": "A triangle has sides 3 cm , 2 cm and 6 cm . What is its perimeter ?",
        "correctAnswer": "11",
        "explanation": "The correct answer is 11.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A regular pentagon has sides of 4 cm . What is its perimeter ?",
        "correctAnswer": "20",
        "explanation": "The correct answer is 20.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "What is the perimeter of a 6 cm by 4 cm rectangle? A 20 cm B 10 cm C 24 cm",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Perimeter",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s04",
    "questions": [
      {
        "number": 1,
        "prompt": "A triangle has sides 5 cm , 5 cm , 5 cm . What is its perimeter? A 15 cm B 10 cm C 25 cm",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "What does perimeter mean? A The distance around a shape B The space inside a shape C The number of corners",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which rectangle has a perimeter of 18 cm ? A 5 cm by 4 cm B 3 cm by 5 cm C 6 cm by 6 cm",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Perimeter",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s05",
    "questions": [
      {
        "number": 1,
        "prompt": "A 3 cm by 4 cm rectangle has a perimeter of 14 cm . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Perimeter is measured in square units . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A square with 5 cm sides has a perimeter of 20 cm . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Perimeter",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s06",
    "questions": [
      {
        "number": 1,
        "prompt": "Which rectangles have a perimeter of 20 cm ? 8 cm by 2 cm 5 cm by 5 cm 9 cm by 2 cm 6 cm by 3 cm",
        "correctAnswer": "8 cm by 2 cm, 5 cm by 5 cm",
        "explanation": "The correct answer is 8 cm by 2 cm, 5 cm by 5 cm.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which shapes have a perimeter of 12 cm ? 3 cm square 4 cm by 2 cm rectangle 6 cm by 6 cm square 2 cm by 3 cm rectangle",
        "correctAnswer": "3 cm square, 4 cm by 2 cm rectangle",
        "explanation": "The correct answer is 3 cm square, 4 cm by 2 cm rectangle.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A rectangle has a perimeter of 26 cm . Its length is 8 cm . What is its width?",
        "correctAnswer": "5",
        "explanation": "The correct answer is 5.",
        "topic": "Perimeter",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s07",
    "questions": [
      {
        "number": 1,
        "prompt": "A rectangle has a perimeter of 22 cm . Its width is 5 cm . What is its length?",
        "correctAnswer": "6",
        "explanation": "The correct answer is 6.",
        "topic": "Perimeter",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A square has a perimeter of 28 cm . How long is each side?",
        "correctAnswer": "7",
        "explanation": "The correct answer is 7.",
        "topic": "Perimeter",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s08",
    "questions": [
      {
        "number": 1,
        "prompt": "Which rectangle has a perimeter of 18 cm ? A 5 cm by 4 cm B 3 cm by 5 cm C 6 cm by 6 cm",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "What is the perimeter ?",
        "correctAnswer": "26",
        "explanation": "The correct answer is 26.",
        "topic": "Perimeter",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s09",
    "questions": [
      {
        "number": 1,
        "prompt": "A rectangle has a perimeter of 22 cm . Its width is 5 cm . What is its length?",
        "correctAnswer": "6",
        "explanation": "The correct answer is 6.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "A square has sides of 8 cm . What is its perimeter ?",
        "correctAnswer": "32",
        "explanation": "The correct answer is 32.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which shapes have a perimeter of 12 cm ? 3 cm square 4 cm by 2 cm rectangle 6 cm by 6 cm square 2 cm by 3 cm rectangle",
        "correctAnswer": "3 cm square, 4 cm by 2 cm rectangle",
        "explanation": "The correct answer is 3 cm square, 4 cm by 2 cm rectangle.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "A triangle has sides 4 cm , 5 cm and 7 cm . What is its perimeter ?",
        "correctAnswer": "16",
        "explanation": "The correct answer is 16.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "A square has a perimeter of 28 cm . How long is each side?",
        "correctAnswer": "7",
        "explanation": "The correct answer is 7.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "A rectangle has a perimeter of 26 cm . Its length is 8 cm . What is its width?",
        "correctAnswer": "5",
        "explanation": "The correct answer is 5.",
        "topic": "Perimeter",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s10",
    "questions": [
      {
        "number": 1,
        "prompt": "Which shapes can be built using only triangles ? hexagon trapezoid square diamond",
        "correctAnswer": "hexagon, trapezoid, diamond",
        "explanation": "The correct answer is hexagon, trapezoid, diamond.",
        "topic": "Compose & Decompose Shapes",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "How many trapezoids make a hexagon?",
        "correctAnswer": "2",
        "explanation": "The correct answer is 2.",
        "topic": "Compose & Decompose Shapes",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "A mirror image is called a",
        "correctAnswer": "flip",
        "explanation": "The correct answer is flip.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Circle the congruent pairs (same shape AND same size). two same-size triangles a big and a small square two same-size circles a triangle and a square",
        "correctAnswer": "two same-size triangles, two same-size circles",
        "explanation": "The correct answer is two same-size triangles, two same-size circles.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "Which transformations keep a shape congruent ? slide flip turn stretch",
        "correctAnswer": "slide, flip, turn",
        "explanation": "The correct answer is slide, flip, turn.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s11",
    "questions": [
      {
        "number": 1,
        "prompt": "Which two shapes make a hexagon ? A 2 squares B 2 trapezoids C 2 triangles",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Compose & Decompose Shapes",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "How many triangles make a trapezoid?",
        "correctAnswer": "3",
        "explanation": "The correct answer is 3.",
        "topic": "Compose & Decompose Shapes",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which two shapes make a rectangle ? A 2 circles B 2 triangles C 2 squares",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Compose & Decompose Shapes",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "A turn keeps a shape congruent. A False B True",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "A mirror image is called a ___ . A spin B slide C flip",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "Which are ways to build a hexagon ? 6 triangles 2 trapezoids 3 diamonds 4 squares",
        "correctAnswer": "6 triangles, 2 trapezoids, 3 diamonds",
        "explanation": "The correct answer is 6 triangles, 2 trapezoids, 3 diamonds.",
        "topic": "Compose & Decompose Shapes",
        "isReview": true
      },
      {
        "number": 7,
        "prompt": "Shapes that are the same shape AND the same size are called",
        "correctAnswer": "congruent",
        "explanation": "The correct answer is congruent.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s12",
    "questions": [
      {
        "number": 1,
        "prompt": "236 is less than 715 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Compare Numbers to 1000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "1 7 4 + 6 2 4",
        "correctAnswer": "798",
        "explanation": "1 7 4 + 6 2 4 = 798.",
        "topic": "Add 3-Digit Numbers",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "170, 328, 954 is in order from least to greatest. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Order Numbers to 1000",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "700 + 70 + 9 =",
        "correctAnswer": "779",
        "explanation": "The correct answer is 779.",
        "topic": "Expanded Form",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "m − 3 = 8 means m = 5 . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Variables & Equations",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s13",
    "questions": [
      {
        "number": 1,
        "prompt": "9 treats are shared equally among 3 friends. How many does each friend get? A 5 B 4 C 3",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Fair-Share Problems",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Write one hundred ninety as a number:",
        "correctAnswer": "190",
        "explanation": "The correct answer is 190.",
        "topic": "Read & Write Numbers to 1000",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "What is the total of all four bars? Trees planted 7 4 2 6 Oak Pine Maple Birch",
        "correctAnswer": "19",
        "explanation": "The correct answer is 19.",
        "topic": "Bar Graphs",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w38-s14",
    "questions": [
      {
        "number": 1,
        "prompt": "Estimate 854 − 695 (round to the nearest 10):",
        "correctAnswer": "150",
        "explanation": "The correct answer is 150.",
        "topic": "Estimate Sums & Differences to 1000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "2 plates with 5 apples each. How many apples in all?",
        "correctAnswer": "10",
        "explanation": "The correct answer is 10.",
        "topic": "Equal Groups & Arrays",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which shows the commutative property? (Order doesn't matter!) A 55 + 67 = 67 + 55 B 55 + 67 = 55 + 67 C 55 − 67 = 67 − 55",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Properties of Addition",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Leo shares 12 cards equally among 2 boxes. How many does each get?",
        "correctAnswer": "6",
        "explanation": "The correct answer is 6.",
        "topic": "Division Word Problems",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "In the pattern 🔴, 🔵, 🔴, 🔵, … the next shape is 🔴. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Repeating Patterns",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "Round 457 to the nearest 100:",
        "correctAnswer": "500",
        "explanation": "The correct answer is 500.",
        "topic": "Round to the Nearest 10 or 100",
        "isReview": true
      },
      {
        "number": 7,
        "prompt": "100 100 100 What number is shown?",
        "correctAnswer": "339",
        "explanation": "The correct answer is 339.",
        "topic": "Place Value: Hundreds, Tens & Ones",
        "isReview": true
      },
      {
        "number": 8,
        "prompt": "Counting by 100s: 300, 400, 500 … What comes next? A 700 B 600 C 500",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Skip-Count by 50s, 100s & 200s",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s01",
    "questions": [
      {
        "number": 1,
        "prompt": "How many mm are in 7 cm ?",
        "correctAnswer": "70",
        "explanation": "The correct answer is 70.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "How many mm are in 3 cm ?",
        "correctAnswer": "30",
        "explanation": "The correct answer is 30.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "How many cm are in 90 mm ?",
        "correctAnswer": "9",
        "explanation": "The correct answer is 9.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "How many cm are in 6 m ?",
        "correctAnswer": "600",
        "explanation": "The correct answer is 600.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "How many cm are in 2 m ?",
        "correctAnswer": "200",
        "explanation": "The correct answer is 200.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s02",
    "questions": [
      {
        "number": 1,
        "prompt": "How many m are in 900 cm ?",
        "correctAnswer": "9",
        "explanation": "The correct answer is 9.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "How many m are in 4 km ?",
        "correctAnswer": "4000",
        "explanation": "The correct answer is 4000.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "What is the best unit to measure a pencil ? A millimetres B metres C centimetres D kilometres",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "What is the best unit to measure an ant ? A millimetres B kilometres C metres D centimetres",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "What is the best unit to measure a classroom ? A centimetres B metres C kilometres D millimetres",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s03",
    "questions": [
      {
        "number": 1,
        "prompt": "What is the best unit to measure the distance from Toronto to Ottawa ? A centimetres B kilometres C millimetres D metres",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which is longer : 90 cm or 1 m? A They are equal B 90 cm C 1 m",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which is shorter : 500 m or 1 km? A 1 km B They are equal C 500 m",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Which is longer : 250 cm or 2 m? A 2 m B 250 cm C They are equal",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "How long is the crayon, to the nearest centimetre?",
        "correctAnswer": "10 cm",
        "explanation": "The correct answer is 10 cm.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s04",
    "questions": [
      {
        "number": 1,
        "prompt": "1 m is longer than 90 cm . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "There are 100 mm in 1 cm . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Circle all the lengths longer than 1 m . 90 cm 150 cm 1 m 2 m",
        "correctAnswer": "150 cm, 2 m",
        "explanation": "The correct answer is 150 cm, 2 m.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "How many mm are in 8 cm ?",
        "correctAnswer": "80",
        "explanation": "The correct answer is 80.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "How many cm are in 40 mm ?",
        "correctAnswer": "4",
        "explanation": "The correct answer is 4.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s05",
    "questions": [
      {
        "number": 1,
        "prompt": "How many cm are in 70 mm ?",
        "correctAnswer": "7",
        "explanation": "The correct answer is 7.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "How many cm are in 7 m ?",
        "correctAnswer": "700",
        "explanation": "The correct answer is 700.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "How many cm are in 3 m ?",
        "correctAnswer": "300",
        "explanation": "The correct answer is 300.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "How many m are in 400 cm ?",
        "correctAnswer": "4",
        "explanation": "The correct answer is 4.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s06",
    "questions": [
      {
        "number": 1,
        "prompt": "How many m are in 3 km ?",
        "correctAnswer": "3000",
        "explanation": "The correct answer is 3000.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "What is the best unit to measure a pencil ? A centimetres B metres C millimetres D kilometres",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "What is the best unit to measure an ant ? A metres B millimetres C kilometres D centimetres",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "What is the best unit to measure a classroom ? A kilometres B centimetres C metres D millimetres",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s07",
    "questions": [
      {
        "number": 1,
        "prompt": "What is the best unit to measure the distance from Toronto to Ottawa ? A centimetres B millimetres C metres D kilometres",
        "correctAnswer": "D",
        "explanation": "The correct answer is D.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which is longer : 90 cm or 1 m? A 90 cm B 1 m C They are equal",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which is shorter : 500 m or 1 km? A 1 km B 500 m C They are equal",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Which is longer : 250 cm or 2 m? A 2 m B They are equal C 250 cm",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s08",
    "questions": [
      {
        "number": 1,
        "prompt": "What is the best unit for the mass of an apple ? A grams B kilograms",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "What is the best unit for the mass of a dog ? A grams B kilograms",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "What is the best unit for the mass of a bag of sugar ? A grams B kilograms",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "What is the best unit for a spoon of medicine ? A litres B millilitres",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "What is the best unit for a bathtub of water ? A litres B millilitres",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "What is the best unit for a juice box ? A litres B millilitres",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "How many g are in 2 kg ?",
        "correctAnswer": "2000",
        "explanation": "The correct answer is 2000.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "How many g are in 5 kg ?",
        "correctAnswer": "5000",
        "explanation": "The correct answer is 5000.",
        "topic": "Mass & Capacity",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s09",
    "questions": [
      {
        "number": 1,
        "prompt": "How many kg are in 3000 g ?",
        "correctAnswer": "3",
        "explanation": "The correct answer is 3.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "How many mL are in 3 L ?",
        "correctAnswer": "3000",
        "explanation": "The correct answer is 3000.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "How many mL are in 5 L ?",
        "correctAnswer": "5000",
        "explanation": "The correct answer is 5000.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "How many L are in 2000 mL ?",
        "correctAnswer": "2",
        "explanation": "The correct answer is 2.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "1 kg is heavier than 900 g . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "500 mL is more than 1 L . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "We measure a car's mass in grams . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "1000 g = 1 kg . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Mass & Capacity",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s10",
    "questions": [
      {
        "number": 1,
        "prompt": "How many kg is 500 g + 500 g ?",
        "correctAnswer": "1",
        "explanation": "The correct answer is 1.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "How many mL is 2 L − 500 mL ?",
        "correctAnswer": "1500",
        "explanation": "The correct answer is 1500.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which is heavier : 2 kg or 1800 g? A 1800 g B 2 kg C They are equal",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Which holds more : 1 L or 900 mL? A 1 L B They are equal C 900 mL",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "What is the best unit for a spoon of medicine ? A millilitres B litres",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "How many g are in 4 kg ?",
        "correctAnswer": "4000",
        "explanation": "The correct answer is 4000.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "How many mL are in 2 L ?",
        "correctAnswer": "2000",
        "explanation": "The correct answer is 2000.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "Which is heavier : 2 kg or 1800 g? A 2 kg B 1800 g C They are equal",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s11",
    "questions": [
      {
        "number": 1,
        "prompt": "Which holds more : 1 L or 900 mL? A 900 mL B 1 L C They are equal",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "What is the best unit for the mass of an apple ? A kilograms B grams",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "What is the best unit for the mass of a bag of sugar ? A kilograms B grams",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "What is the best unit for a bathtub of water ? A millilitres B litres",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "What is the best unit for a juice box ? A millilitres B litres",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "How many g are in 3 kg ?",
        "correctAnswer": "3000",
        "explanation": "The correct answer is 3000.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "Which holds more : 1 L or 900 mL? A 900 mL B They are equal C 1 L",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Mass & Capacity",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "Which is heavier : 2 kg or 1800 g? A 2 kg B They are equal C 1800 g",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s12",
    "questions": [
      {
        "number": 1,
        "prompt": "1 m is longer than 90 cm . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s13",
    "questions": [
      {
        "number": 1,
        "prompt": "Which is longer : 90 cm or 1 m? A They are equal B 90 cm C 1 m",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "What is the best unit for a bathtub of water ? A millilitres B litres",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "What is the best unit for a bathtub of water ? A litres B millilitres",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "What is the best unit for the mass of a bag of sugar ? A grams B kilograms",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "There are 100 mm in 1 cm . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "Which is heavier : 2 kg or 1800 g? A 2 kg B They are equal C 1800 g",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": true
      },
      {
        "number": 7,
        "prompt": "Which is shorter : 500 m or 1 km? A 1 km B They are equal C 500 m",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s14",
    "questions": [
      {
        "number": 1,
        "prompt": "A mirror image is called a ___ . A flip B spin C slide",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "A slide changes the size of a shape. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "What is the perimeter ?",
        "correctAnswer": "26",
        "explanation": "The correct answer is 26.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "A square has sides of 8 cm . What is its perimeter ?",
        "correctAnswer": "32",
        "explanation": "The correct answer is 32.",
        "topic": "Perimeter",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s15",
    "questions": [
      {
        "number": 1,
        "prompt": "A triangle has sides 5 cm , 5 cm , 5 cm . What is its perimeter? A 15 cm B 10 cm C 25 cm",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "A mirror image is called a",
        "correctAnswer": "flip",
        "explanation": "The correct answer is flip.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "A mirror image is called a ___ . A slide B flip C spin",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Which shows a flip (mirror image)? Start: A B C",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s16",
    "questions": [
      {
        "number": 1,
        "prompt": "What is the perimeter ?",
        "correctAnswer": "20",
        "explanation": "The correct answer is 20.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Two shapes are the same shape but different sizes. Are they congruent? A Yes B No",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Congruent Shapes & Transformations",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "A triangle has sides 3 cm , 2 cm and 6 cm . What is its perimeter ?",
        "correctAnswer": "11",
        "explanation": "The correct answer is 11.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Which shapes have a perimeter of 12 cm ? 3 cm square 4 cm by 2 cm rectangle 6 cm by 6 cm square 2 cm by 3 cm rectangle",
        "correctAnswer": "3 cm square, 4 cm by 2 cm rectangle",
        "explanation": "The correct answer is 3 cm square, 4 cm by 2 cm rectangle.",
        "topic": "Perimeter",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s17",
    "questions": [
      {
        "number": 1,
        "prompt": "152 is less than 524 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Compare Numbers to 1000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Round 535 to the nearest 10:",
        "correctAnswer": "540",
        "explanation": "The correct answer is 540.",
        "topic": "Round to the Nearest 10 or 100",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "4/10 = 2/5 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Equivalent Fractions",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "600 + 40 + 1 =",
        "correctAnswer": "641",
        "explanation": "The correct answer is 641.",
        "topic": "Expanded Form",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "What is the mean (fair share) of 8, 6, 6, 8?",
        "correctAnswer": "7",
        "explanation": "The correct answer is 7.",
        "topic": "Mean, Mode & Probability Words",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s18",
    "questions": [
      {
        "number": 1,
        "prompt": "In 642 , what is the value of the digit in the ones place?",
        "correctAnswer": "2",
        "explanation": "The correct answer is 2.",
        "topic": "Place Value: Hundreds, Tens & Ones",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Which equals 30 ÷ 10 ? A 5 B 6 C 3",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Divide by 2, 5 & 10",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "9 6 6 − 6 7 9",
        "correctAnswer": "287",
        "explanation": "9 6 6 − 6 7 9 = 287.",
        "topic": "Subtract 3-Digit Numbers",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Least to greatest: 834, 404, 946",
        "correctAnswer": "404, 834, 946",
        "explanation": "The correct answer is 404, 834, 946.",
        "topic": "Order Numbers to 1000",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "Which solid has 2 faces , 1 edges and 1 vertices ? A cube B triangular prism C cone",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "3D Shapes: Faces, Edges & Vertices",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w39-s19",
    "questions": [
      {
        "number": 1,
        "prompt": "Which number is four hundred sixty-five ? A 365 B 455 C 465",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Read & Write Numbers to 1000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "How many toys are round altogether? Toy box sort Round Not round Red 2 5 Not red 5 1",
        "correctAnswer": "7",
        "explanation": "The correct answer is 7.",
        "topic": "Venn & Carroll Diagrams",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Counting by 100s: 600, 700, 800, 900 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Skip-Count by 50s, 100s & 200s",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "8 × 5 =",
        "correctAnswer": "40",
        "explanation": "The correct answer is 40.",
        "topic": "Multiply by 2, 5 & 10",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "Ava has 5 apples. Noah has twice as many. How many does Noah have? A 10 B 12 C 8",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Scaling: Twice, 5 Times & 10 Times as Many",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "15, 18, 21, 24,",
        "correctAnswer": "27",
        "explanation": "The correct answer is 27.",
        "topic": "Growing Patterns",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s01",
    "questions": [
      {
        "number": 1,
        "prompt": "What time is it?",
        "correctAnswer": "1:45",
        "explanation": "The correct answer is 1:45.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "What time is it?",
        "correctAnswer": "12:00",
        "explanation": "The correct answer is 12:00.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "What time is it?",
        "correctAnswer": "1:00",
        "explanation": "The correct answer is 1:00.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "What time is it?",
        "correctAnswer": "5:00",
        "explanation": "The correct answer is 5:00.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "What time is it?",
        "correctAnswer": "9:00",
        "explanation": "The correct answer is 9:00.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s02",
    "questions": [
      {
        "number": 1,
        "prompt": "What time is it?",
        "correctAnswer": "7:00",
        "explanation": "The correct answer is 7:00.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which clock shows 12:15 ? A B C",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which clock shows 3:30 ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Which clock shows 7:45 ? A B C",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "Which clock shows 1:30 ? A B C",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s03",
    "questions": [
      {
        "number": 1,
        "prompt": "School starts at 8:00",
        "correctAnswer": "AM",
        "explanation": "The correct answer is AM.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Dinner is at 6:00",
        "correctAnswer": "PM",
        "explanation": "The correct answer is PM.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "The sun rises at 6:30",
        "correctAnswer": "AM",
        "explanation": "The correct answer is AM.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Hockey practice is at 5:30",
        "correctAnswer": "PM",
        "explanation": "The correct answer is PM.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s04",
    "questions": [
      {
        "number": 1,
        "prompt": "A movie starts at 3:00 and ends at 4:00 . How many hours long is it?",
        "correctAnswer": "1",
        "explanation": "The correct answer is 1.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A movie starts at 3:00 and ends at 5:00 . How many hours long is it?",
        "correctAnswer": "2",
        "explanation": "The correct answer is 2.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A movie starts at 5:00 and ends at 6:00 . How many hours long is it?",
        "correctAnswer": "1",
        "explanation": "The correct answer is 1.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Half past 4 is the same as 4:30 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s05",
    "questions": [
      {
        "number": 1,
        "prompt": "How many unit squares cover this rectangle?",
        "correctAnswer": "30",
        "explanation": "The correct answer is 30.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "How many unit squares cover this rectangle?",
        "correctAnswer": "42",
        "explanation": "The correct answer is 42.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "How many unit squares cover this rectangle?",
        "correctAnswer": "9",
        "explanation": "The correct answer is 9.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s06",
    "questions": [
      {
        "number": 1,
        "prompt": "How many unit squares cover this rectangle?",
        "correctAnswer": "10",
        "explanation": "The correct answer is 10.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "How many unit squares cover this rectangle?",
        "correctAnswer": "6",
        "explanation": "The correct answer is 6.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "How many unit squares cover this rectangle?",
        "correctAnswer": "20",
        "explanation": "The correct answer is 20.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s07",
    "questions": [
      {
        "number": 1,
        "prompt": "A rectangle is 8 cm long and 6 cm wide. What is its area in square centimetres ?",
        "correctAnswer": "48",
        "explanation": "The correct answer is 48.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A rectangle is 5 cm long and 4 cm wide. What is its area in square centimetres ?",
        "correctAnswer": "20",
        "explanation": "The correct answer is 20.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A rectangle is 6 cm long and 6 cm wide. What is its area in square centimetres ?",
        "correctAnswer": "36",
        "explanation": "The correct answer is 36.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s08",
    "questions": [
      {
        "number": 1,
        "prompt": "A rectangle is 7 cm long and 9 cm wide. What is its area in square centimetres ?",
        "correctAnswer": "63",
        "explanation": "The correct answer is 63.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A rectangle is 4 cm long and 3 cm wide. What is its area in square centimetres ?",
        "correctAnswer": "12",
        "explanation": "The correct answer is 12.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A rectangle is 2 cm long and 9 cm wide. What is its area in square centimetres ?",
        "correctAnswer": "18",
        "explanation": "The correct answer is 18.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s09",
    "questions": [
      {
        "number": 1,
        "prompt": "Which rectangle has an area of 12 square units ? A 2 by 5 B 5 by 5 C 3 by 4",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which rectangle has an area of 12 square units ? A 3 by 4 B 2 by 5 C 5 by 5",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which rectangle has an area of 20 square units ? A 7 by 7 B 4 by 5 C 3 by 6",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s10",
    "questions": [
      {
        "number": 1,
        "prompt": "Which rectangle has an area of 20 square units ? A 4 by 5 B 3 by 6 C 7 by 7",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A 4 by 3 rectangle has an area of 12 square units . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Area is measured in centimetres . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s11",
    "questions": [
      {
        "number": 1,
        "prompt": "Circle all the rectangles with an area of 18 square units . 9 by 2 6 by 3 5 by 4 3 by 5",
        "correctAnswer": "9 by 2, 6 by 3",
        "explanation": "The correct answer is 9 by 2, 6 by 3.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Circle all the rectangles with an area of 24 square units . 6 by 4 8 by 3 5 by 5 7 by 3",
        "correctAnswer": "6 by 4, 8 by 3",
        "explanation": "The correct answer is 6 by 4, 8 by 3.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s12",
    "questions": [
      {
        "number": 1,
        "prompt": "The apple pie costs $3.02 . You pay with $5 How much change do you get?",
        "correctAnswer": "$1.98",
        "explanation": "The correct answer is $1.98.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "The toy car costs $3.92 . You pay with $5 How much change do you get?",
        "correctAnswer": "$1.08",
        "explanation": "The correct answer is $1.08.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "The soccer ball costs $3.05 . You pay with $5 How much change do you get?",
        "correctAnswer": "$1.95",
        "explanation": "The correct answer is $1.95.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "The apple pie costs $5.07 . You pay with $10 How much change do you get?",
        "correctAnswer": "$4.93",
        "explanation": "The correct answer is $4.93.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "The kite costs $6.72 . You pay with $10 How much change do you get?",
        "correctAnswer": "$3.28",
        "explanation": "The correct answer is $3.28.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "The ice cream costs $2.69 . You pay with $5 How much change do you get?",
        "correctAnswer": "$2.31",
        "explanation": "The correct answer is $2.31.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "The apple pie costs $7.52 . You pay with $10 How much change do you get?",
        "correctAnswer": "$2.48",
        "explanation": "The correct answer is $2.48.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "The ice cream costs $4.76 . You pay with $5 How much change do you get?",
        "correctAnswer": "24¢",
        "explanation": "The correct answer is 24¢.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 9,
        "prompt": "The book costs $6.20 . You pay with $10 How much change do you get?",
        "correctAnswer": "$3.80",
        "explanation": "The correct answer is $3.80.",
        "topic": "Making Change",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s13",
    "questions": [
      {
        "number": 1,
        "prompt": "The toy car costs $8.97 . You pay with $10 How much change do you get?",
        "correctAnswer": "$1.03",
        "explanation": "The correct answer is $1.03.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "The book costs $3.97 . You pay with $5 How much change do you get?",
        "correctAnswer": "$1.03",
        "explanation": "The correct answer is $1.03.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which coins make exactly 75¢ ? A B C",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Which coins make exactly 35¢ ? A B C",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "Which coins make exactly 45¢ ? A B C",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "Which coins make exactly 45¢ ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "You pay $2 for a 130¢ chocolate bar. Your change is 70¢ . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "Change for $5 − $2.25 is $2.75 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 9,
        "prompt": "You pay $1 for an 85¢ candy. Your change is 20¢ . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Making Change",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s14",
    "questions": [
      {
        "number": 1,
        "prompt": "Circle ALL the coin groups worth 50¢ .",
        "correctAnswer": "<span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"></span>, <span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"></span>",
        "explanation": "The correct answer is <span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"></span>, <span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"></span>.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Circle ALL the ways to pay exactly $1 .",
        "correctAnswer": "<span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_100.png\" alt=\"1 dollar\" style=\"width:48px;height:48px\"></span>, <span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"></span>, <span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"></span>",
        "explanation": "The correct answer is <span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_100.png\" alt=\"1 dollar\" style=\"width:48px;height:48px\"></span>, <span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"><img class=\"coinimg\" src=\"assets/coins/coin_25.png\" alt=\"25 cents\" style=\"width:44px;height:44px\"></span>, <span class=\"coins-row\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"><img class=\"coinimg\" src=\"assets/coins/coin_10.png\" alt=\"10 cents\" style=\"width:36px;height:36px\"></span>.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "The puzzle costs $6.32 . You pay with $10 How much change do you get?",
        "correctAnswer": "$3.68",
        "explanation": "The correct answer is $3.68.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "The toy car costs $4.25 . You pay with $5 How much change do you get?",
        "correctAnswer": "75¢",
        "explanation": "The correct answer is 75¢.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "The box of crayons costs $4.14 . You pay with $5 How much change do you get?",
        "correctAnswer": "86¢",
        "explanation": "The correct answer is 86¢.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "The box of crayons costs $5.59 . You pay with $10 How much change do you get?",
        "correctAnswer": "$4.41",
        "explanation": "The correct answer is $4.41.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "The toy car costs 87¢ . You pay with How much change do you get?",
        "correctAnswer": "13¢",
        "explanation": "The correct answer is 13¢.",
        "topic": "Making Change",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s15",
    "questions": [
      {
        "number": 1,
        "prompt": "The ice cream costs $3.84 . You pay with $5 How much change do you get?",
        "correctAnswer": "$1.16",
        "explanation": "The correct answer is $1.16.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "The puzzle costs $9.22 . You pay with $10 How much change do you get?",
        "correctAnswer": "78¢",
        "explanation": "The correct answer is 78¢.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "The soccer ball costs $6.94 . You pay with $10 How much change do you get?",
        "correctAnswer": "$3.06",
        "explanation": "The correct answer is $3.06.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "The book costs 68¢ . You pay with How much change do you get?",
        "correctAnswer": "32¢",
        "explanation": "The correct answer is 32¢.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "The kite costs $4.99 . You pay with $5 How much change do you get?",
        "correctAnswer": "1¢",
        "explanation": "The correct answer is 1¢.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "The apple pie costs $3.22 . You pay with $5 How much change do you get?",
        "correctAnswer": "$1.78",
        "explanation": "The correct answer is $1.78.",
        "topic": "Making Change",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "Which coins make exactly 55¢ ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Making Change",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s16",
    "questions": [
      {
        "number": 1,
        "prompt": "How many unit squares cover this rectangle?",
        "correctAnswer": "10",
        "explanation": "The correct answer is 10.",
        "topic": "Area of Rectangles",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s17",
    "questions": [
      {
        "number": 1,
        "prompt": "School starts at 8:00",
        "correctAnswer": "AM",
        "explanation": "The correct answer is AM.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "What time is it?",
        "correctAnswer": "1:45",
        "explanation": "The correct answer is 1:45.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Area is measured in centimetres . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "A rectangle is 5 cm long and 4 cm wide. What is its area in square centimetres ?",
        "correctAnswer": "20",
        "explanation": "The correct answer is 20.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "A movie starts at 3:00 and ends at 4:00 . How many hours long is it?",
        "correctAnswer": "1",
        "explanation": "The correct answer is 1.",
        "topic": "Time: Analog & Digital Clocks",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "Change for $5 − $2.25 is $2.75 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Making Change",
        "isReview": true
      },
      {
        "number": 7,
        "prompt": "The apple pie costs $3.22 . You pay with $5 How much change do you get?",
        "correctAnswer": "$1.78",
        "explanation": "The correct answer is $1.78.",
        "topic": "Making Change",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s18",
    "questions": [
      {
        "number": 1,
        "prompt": "What is the best unit for a bathtub of water ? A litres B millilitres",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "What is the perimeter ?",
        "correctAnswer": "26",
        "explanation": "The correct answer is 26.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which is longer : 250 cm or 2 m? A 2 m B 250 cm C They are equal",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "500 mL is more than 1 L . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Mass & Capacity",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s19",
    "questions": [
      {
        "number": 1,
        "prompt": "What is the perimeter ?",
        "correctAnswer": "20",
        "explanation": "The correct answer is 20.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "What is the best unit for the mass of a bag of sugar ? A grams B kilograms",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Mass & Capacity",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "1 m is longer than 90 cm . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s20",
    "questions": [
      {
        "number": 1,
        "prompt": "A regular pentagon has sides of 4 cm . What is its perimeter ?",
        "correctAnswer": "20",
        "explanation": "The correct answer is 20.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "What is the best unit for the mass of an apple ? A grams B kilograms",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass & Capacity",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "There are 100 mm in 1 cm . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "What does perimeter mean? A The distance around a shape B The space inside a shape C The number of corners",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Perimeter",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "Which is shorter : 500 m or 1 km? A 1 km B They are equal C 500 m",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Metric Length: mm, cm, m, km",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s21",
    "questions": [
      {
        "number": 1,
        "prompt": "Estimate 477 + 591 (round to the nearest 10):",
        "correctAnswer": "1070",
        "explanation": "The correct answer is 1070.",
        "topic": "Estimate Sums & Differences to 1000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "1/4 of 8 =",
        "correctAnswer": "2",
        "explanation": "The correct answer is 2.",
        "topic": "Fractions of a Group",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "How many triangles make a trapezoid?",
        "correctAnswer": "3",
        "explanation": "The correct answer is 3.",
        "topic": "Compose & Decompose Shapes",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Round 580 to the nearest 100. A 500 B 600 C 700",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Round to the Nearest 10 or 100",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "What is the pattern rule? 49, 42, 35, 28 A Subtract 7 each time B Subtract 8 each time C Add 7 each time",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Pattern Rules",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s22",
    "questions": [
      {
        "number": 1,
        "prompt": "The least of 464, 843, 197, 707 is",
        "correctAnswer": "197",
        "explanation": "The correct answer is 197.",
        "topic": "Order Numbers to 1000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Write three hundred thirty-six as a number:",
        "correctAnswer": "336",
        "explanation": "The correct answer is 336.",
        "topic": "Read & Write Numbers to 1000",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which picture shows 2/3 ? A B C",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Halves, Thirds & Fourths",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "100 100 100 What number is shown?",
        "correctAnswer": "339",
        "explanation": "The correct answer is 339.",
        "topic": "Place Value: Hundreds, Tens & Ones",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "5 × 5 = 25 , so 25 ÷ 5 =",
        "correctAnswer": "5",
        "explanation": "The correct answer is 5.",
        "topic": "Relate Multiplication & Division",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g3-w40-s23",
    "questions": [
      {
        "number": 1,
        "prompt": "Counting by 100s: 300, 400, 500, 700 . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Skip-Count by 50s, 100s & 200s",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "458 = + +",
        "correctAnswer": "400 + 50 + 8",
        "explanation": "The correct answer is 400 + 50 + 8.",
        "topic": "Expanded Form",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which number is greater than 463 ? A 463 B 402 C 517",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Compare Numbers to 1000",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Owen has 407 stickers and gets 157 more. How many in all?",
        "correctAnswer": "564",
        "explanation": "The correct answer is 564.",
        "topic": "Addition & Subtraction Word Problems",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "Which was the most popular? Favourite sport ⚽ — class votes Choice Tally Frequency Soccer 11 Swimming 3 Hockey 10 Tennis 4",
        "correctAnswer": "Soccer",
        "explanation": "The correct answer is Soccer.",
        "topic": "Frequency Tables",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "2/3 = 1/3 + 1/3. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Unit Fractions & Decomposition",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s01",
    "questions": [
      {
        "number": 1,
        "prompt": "Which angle is acute ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which angle is right ? A B C",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Classify Angles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s02",
    "questions": [
      {
        "number": 1,
        "prompt": "Which angle is obtuse ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which angle is straight ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which angle is acute ? A B C",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Which angle is obtuse ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s03",
    "questions": [
      {
        "number": 1,
        "prompt": "Which angle is right ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which angle is acute ? A B C",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which angle is obtuse ? A B C",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Which angle is straight ? A B C",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Classify Angles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s04",
    "questions": [
      {
        "number": 1,
        "prompt": "An angle that measures 90° is .",
        "correctAnswer": "right",
        "explanation": "The correct answer is right.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "An angle that measures 100° is .",
        "correctAnswer": "obtuse",
        "explanation": "The correct answer is obtuse.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "An angle that measures 75° is .",
        "correctAnswer": "acute",
        "explanation": "The correct answer is acute.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "An angle that measures 155° is .",
        "correctAnswer": "obtuse",
        "explanation": "The correct answer is obtuse.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "An angle that measures 65° is .",
        "correctAnswer": "acute",
        "explanation": "The correct answer is acute.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "An angle that measures 140° is .",
        "correctAnswer": "obtuse",
        "explanation": "The correct answer is obtuse.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "A straight angle measures __ degrees.",
        "correctAnswer": "180",
        "explanation": "The correct answer is 180.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "A right angle measures __ degrees.",
        "correctAnswer": "90",
        "explanation": "The correct answer is 90.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 9,
        "prompt": "Which of these is a obtuse angle? A 90° B 25° C 115°",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 10,
        "prompt": "Which of these is a obtuse angle? A 90° B 125° C 25°",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 11,
        "prompt": "Which of these is a obtuse angle? A 140° B 90° C 75°",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 12,
        "prompt": "Which of these is a acute angle? A 115° B 75° C 90°",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Classify Angles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s05",
    "questions": [
      {
        "number": 1,
        "prompt": "Which of these is a straight angle? A 180° B 90° C 45°",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which of these is a obtuse angle? A 35° B 90° C 140°",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "An angle of 90° is a right angle. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "An angle of 180° is a straight angle. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "A right angle measures 100°. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "An angle of 89° is acute. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "An angle of 95° is obtuse. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "An angle of 91° is a right angle. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 9,
        "prompt": "The tip of a slice of pizza is an __ angle.",
        "correctAnswer": "acute",
        "explanation": "The correct answer is acute.",
        "topic": "Classify Angles",
        "isReview": false
      },
      {
        "number": 10,
        "prompt": "The hands of a clock at 3:00 make a __ angle.",
        "correctAnswer": "right",
        "explanation": "The correct answer is right.",
        "topic": "Classify Angles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s06",
    "questions": [
      {
        "number": 1,
        "prompt": "An angle of 91° is a right angle. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Which of these is a straight angle? A 180° B 90° C 45°",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which angle is obtuse ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "The tip of a slice of pizza is an __ angle.",
        "correctAnswer": "acute",
        "explanation": "The correct answer is acute.",
        "topic": "Classify Angles",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s07",
    "questions": [
      {
        "number": 1,
        "prompt": "A right angle measures 100°. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Which angle is acute ? A B C",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which angle is obtuse ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "A right angle measures __ degrees.",
        "correctAnswer": "90",
        "explanation": "The correct answer is 90.",
        "topic": "Classify Angles",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s08",
    "questions": [
      {
        "number": 1,
        "prompt": "3 L 3,000 mL",
        "correctAnswer": "=",
        "explanation": "The correct answer is =.",
        "topic": "Mass (g, kg) & Capacity (mL, L)",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "The mass of a family car is about… A 1,500 kg B 1,500 g C 15 kg",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Mass (g, kg) & Capacity (mL, L)",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "A movie starts at 1:00 and lasts 40 minutes . It ends at",
        "correctAnswer": "1:40",
        "explanation": "The correct answer is 1:40.",
        "topic": "Elapsed Time",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Which unit would you use to measure the capacity of a swimming pool ? A km B mL C L",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Choose the Right Metric Unit",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "A bus ride to Ottawa ends at 5:05 and lasted 1 hour 45 minutes . It started at",
        "correctAnswer": "3:20",
        "explanation": "The correct answer is 3:20.",
        "topic": "Elapsed Time",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "A school play ends at 5:40 and lasted 15 minutes . It started at",
        "correctAnswer": "5:25",
        "explanation": "The correct answer is 5:25.",
        "topic": "Elapsed Time",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s09",
    "questions": [
      {
        "number": 1,
        "prompt": "A watermelon's mass is best measured in grams. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Choose the Right Metric Unit",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "3 kg 3,000 g",
        "correctAnswer": "=",
        "explanation": "The correct answer is =.",
        "topic": "Mass (g, kg) & Capacity (mL, L)",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "A baby has a mass of about 4 __.",
        "correctAnswer": "kg",
        "explanation": "The correct answer is kg.",
        "topic": "Choose the Right Metric Unit",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Which unit would you use to measure the length of a hockey stick ? A m B km C cm",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Choose the Right Metric Unit",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "From 5:50 to 6:10 is 20 minutes . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Elapsed Time",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "A bag of apples has a mass of 3 kg . A bag of oranges has a mass of 2,500 g. Which bag is heavier?",
        "correctAnswer": "apples",
        "explanation": "The correct answer is apples.",
        "topic": "Mass (g, kg) & Capacity (mL, L)",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s10",
    "questions": [
      {
        "number": 1,
        "prompt": "What is 32 ÷ 4 ? A 7 B 8 C 9",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Division Facts to 100 ÷ 10",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "What fraction belongs where the __ is?",
        "correctAnswer": "3/6",
        "explanation": "The correct answer is 3/6.",
        "topic": "Fractions on Number Lines",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "3000 + 800 + 20 + 2 =",
        "correctAnswer": "3822",
        "explanation": "The correct answer is 3822.",
        "topic": "Place Value to 10,000",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "8.9 rounds to 9 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Round Decimals to the Nearest Whole",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s11",
    "questions": [
      {
        "number": 1,
        "prompt": "After-School Club Choice Tally Frequency Chess 11 Art 3 Drama 8 Coding 8 How many votes were counted in all?",
        "correctAnswer": "30",
        "explanation": "The correct answer is 30.",
        "topic": "Frequency Tables & Stem-and-Leaf Plots",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "10 × 100 = 1,000 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Multiply & Divide by 10, 100, 1000",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "5 × 5 =",
        "correctAnswer": "25",
        "explanation": "The correct answer is 25.",
        "topic": "Multiplication Facts to 10 × 10",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Banff National Park had 2,325 visitors last July. About how many is that to the nearest 1,000?",
        "correctAnswer": "2000",
        "explanation": "The correct answer is 2000.",
        "topic": "Round to the Nearest 10, 100 or 1000",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w38-s12",
    "questions": [
      {
        "number": 1,
        "prompt": "3/6 = 1 /",
        "correctAnswer": "2",
        "explanation": "The correct answer is 2.",
        "topic": "Equivalent Fractions",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Owen has 42 hockey cards. Owen gives 1/6 of them to Mia. How many hockey cards does Mia get?",
        "correctAnswer": "7",
        "explanation": "The correct answer is 7.",
        "topic": "Fraction Word Problems",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Write from least to greatest: 0.0 , 0.8 , 0.2",
        "correctAnswer": "0.0, 0.2, 0.8",
        "explanation": "The correct answer is 0.0, 0.2, 0.8.",
        "topic": "Decimals to Tenths",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Solve: 9 7 0 8",
        "correctAnswer": "78 R 6",
        "explanation": "The correct answer is 78 R 6.",
        "topic": "Divide 3-Digit by 1-Digit",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "1/9 is a unit fraction. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Fractions: Halves to Tenths",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "Figure 1 uses 4 toothpicks, figure 2 uses 7, figure 3 uses 10. How many toothpicks does figure 8 need?",
        "correctAnswer": "25",
        "explanation": "The correct answer is 25.",
        "topic": "Pattern Rules & Geometric Patterns",
        "isReview": true
      },
      {
        "number": 7,
        "prompt": "Greatest to least: 6175, 3542, 1661",
        "correctAnswer": "6175, 3542, 1661",
        "explanation": "The correct answer is 6175, 3542, 1661.",
        "topic": "Compare & Order to 10,000",
        "isReview": true
      },
      {
        "number": 8,
        "prompt": "A door is a rectangle, so its opposite sides are parallel. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Rectangle Properties",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s01",
    "questions": [
      {
        "number": 1,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "32",
        "explanation": "The correct answer is 32.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "63",
        "explanation": "The correct answer is 63.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "42",
        "explanation": "The correct answer is 42.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s02",
    "questions": [
      {
        "number": 1,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "12",
        "explanation": "The correct answer is 12.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "35",
        "explanation": "The correct answer is 35.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "36",
        "explanation": "The correct answer is 36.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "24",
        "explanation": "The correct answer is 24.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "27",
        "explanation": "The correct answer is 27.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s03",
    "questions": [
      {
        "number": 1,
        "prompt": "A rectangle is 4 cm by 8 cm . Its area is __ square centimetres.",
        "correctAnswer": "32",
        "explanation": "The correct answer is 32.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A rectangle is 9 cm by 4 cm . Its area is __ square centimetres.",
        "correctAnswer": "36",
        "explanation": "The correct answer is 36.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A rectangle is 5 cm by 9 cm . Its area is __ square centimetres.",
        "correctAnswer": "45",
        "explanation": "The correct answer is 45.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "A rectangle is 4 cm by 7 cm . Its area is __ square centimetres.",
        "correctAnswer": "28",
        "explanation": "The correct answer is 28.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "A rectangle is 6 cm by 10 cm . Its area is __ square centimetres.",
        "correctAnswer": "60",
        "explanation": "The correct answer is 60.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "A rectangle is 8 cm by 10 cm . Its area is __ square centimetres.",
        "correctAnswer": "80",
        "explanation": "The correct answer is 80.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "A rectangle is 10 cm by 5 cm . Its area is __ square centimetres.",
        "correctAnswer": "50",
        "explanation": "The correct answer is 50.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "A rectangle is 8 cm by 8 cm . Its area is __ square centimetres.",
        "correctAnswer": "64",
        "explanation": "The correct answer is 64.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 9,
        "prompt": "What is the area of a 12 cm by 4 cm rectangle? (square centimetres) A 60 B 58 C 48 D 52",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 10,
        "prompt": "What is the area of a 5 cm by 10 cm rectangle? (square centimetres) A 15 B 50 C 60 D 45",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 11,
        "prompt": "What is the area of a 11 cm by 10 cm rectangle? (square centimetres) A 120 B 121 C 110 D 99",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 12,
        "prompt": "What is the area of a 10 cm by 6 cm rectangle? (square centimetres) A 16 B 60 C 70 D 66",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 13,
        "prompt": "What is the area of a 10 cm by 4 cm rectangle? (square centimetres) A 50 B 40 C 30 D 14",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s04",
    "questions": [
      {
        "number": 1,
        "prompt": "What is the area of a 5 cm by 5 cm rectangle? (square centimetres) A 25 B 10 C 35 D 30",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Area is measured in square units. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A 4 cm by 4 cm square has an area of 8 square centimetres. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "A 10 by 3 rectangle has an area of 30 square units. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "To find the area of a rectangle, multiply length by width. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "A 5 m by 6 m rug has an area of 11 square metres. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "A 7 cm by 7 cm square has an area of 49 square centimetres. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "A desk top is 9 dm by 6 dm . Its area is __ square decimetres.",
        "correctAnswer": "54",
        "explanation": "The correct answer is 54.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 9,
        "prompt": "A garden is 8 m long and 5 m wide. Its area is __ square metres.",
        "correctAnswer": "40",
        "explanation": "The correct answer is 40.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 10,
        "prompt": "A classroom rug is 6 m by 4 m . Its area is __ square metres.",
        "correctAnswer": "24",
        "explanation": "The correct answer is 24.",
        "topic": "Area of Rectangles",
        "isReview": false
      },
      {
        "number": 11,
        "prompt": "A hockey rink is 60 m by 30 m . Its area is __ square metres.",
        "correctAnswer": "1,800",
        "explanation": "The correct answer is 1,800.",
        "topic": "Area of Rectangles",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s05",
    "questions": [
      {
        "number": 1,
        "prompt": "A rectangle is 6 cm by 10 cm . Its area is __ square centimetres.",
        "correctAnswer": "60",
        "explanation": "The correct answer is 60.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "A rectangle is 10 cm by 5 cm . Its area is __ square centimetres.",
        "correctAnswer": "50",
        "explanation": "The correct answer is 50.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "A 10 by 3 rectangle has an area of 30 square units. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "A rectangle is 8 cm by 8 cm . Its area is __ square centimetres.",
        "correctAnswer": "64",
        "explanation": "The correct answer is 64.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "Count the unit squares. The area is __ square units.",
        "correctAnswer": "12",
        "explanation": "The correct answer is 12.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "To find the area of a rectangle, multiply length by width. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 7,
        "prompt": "A rectangle is 4 cm by 7 cm . Its area is __ square centimetres.",
        "correctAnswer": "28",
        "explanation": "The correct answer is 28.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 8,
        "prompt": "What is the area of a 12 cm by 4 cm rectangle? (square centimetres) A 60 B 58 C 48 D 52",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Area of Rectangles",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s06",
    "questions": [
      {
        "number": 1,
        "prompt": "A right angle measures 100°. T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "A movie starts at 1:00 and lasts 40 minutes . It ends at",
        "correctAnswer": "1:40",
        "explanation": "The correct answer is 1:40.",
        "topic": "Elapsed Time",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "A pencil is about 15 __ long.",
        "correctAnswer": "cm",
        "explanation": "The correct answer is cm.",
        "topic": "Choose the Right Metric Unit",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "An angle that measures 75° is .",
        "correctAnswer": "acute",
        "explanation": "The correct answer is acute.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "A school play ends at 5:40 and lasted 15 minutes . It started at",
        "correctAnswer": "5:25",
        "explanation": "The correct answer is 5:25.",
        "topic": "Elapsed Time",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "A birthday party ends at 5:00 and lasted 1 hour . It started at",
        "correctAnswer": "4:00",
        "explanation": "The correct answer is 4:00.",
        "topic": "Elapsed Time",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s07",
    "questions": [
      {
        "number": 1,
        "prompt": "Which unit would you use to measure the mass of a paperclip ? A L B g C kg",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Choose the Right Metric Unit",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Which of these is a obtuse angle? A 35° B 90° C 140°",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Mia's water bottle holds 500 mL . Leo's holds 1 L . Whose bottle holds more?",
        "correctAnswer": "Leo's",
        "explanation": "The correct answer is Leo's.",
        "topic": "Choose the Right Metric Unit",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Which unit would you use to measure the length of a hockey stick ? A m B km C cm",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Choose the Right Metric Unit",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "A birthday party starts at 2:55 and lasts 1 hour 30 minutes . It ends at",
        "correctAnswer": "4:25",
        "explanation": "The correct answer is 4:25.",
        "topic": "Elapsed Time",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "Which angle is obtuse ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s08",
    "questions": [
      {
        "number": 1,
        "prompt": "9 2 × 5",
        "correctAnswer": "460",
        "explanation": "9 2 × 5 = 460.",
        "topic": "Multiply 1-Digit × 2-Digit",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "The marked point is 2/6 . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Fractions on Number Lines",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "The rule is ×4 . IN 27 ? 8 14 OUT 108 68 32 56 Write the missing IN value:",
        "correctAnswer": "17",
        "explanation": "The correct answer is 17.",
        "topic": "Input/Output Tables",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s09",
    "questions": [
      {
        "number": 1,
        "prompt": "0.1 + 0.4 =",
        "correctAnswer": "0.5",
        "explanation": "The correct answer is 0.5.",
        "topic": "Add & Subtract Decimal Tenths",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Which fraction is equivalent to 3/4 ? A 9/12 B 3/5 C 4/4",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Equivalent Fractions",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "What are the coordinates of the green dot (point A)?",
        "correctAnswer": "(5, 3)",
        "explanation": "The correct answer is (5, 3).",
        "topic": "The Coordinate Plane (Quadrant I)",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "If n = 15, what is the value of n − 10 ?",
        "correctAnswer": "5",
        "explanation": "The correct answer is 5.",
        "topic": "Write Expressions & Equations",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s10",
    "questions": [
      {
        "number": 1,
        "prompt": "Round 1,677 to the nearest 10:",
        "correctAnswer": "1680",
        "explanation": "The correct answer is 1680.",
        "topic": "Round to the Nearest 10, 100 or 1000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Twice as many as 6 is 12 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Multiplicative Comparison & Unit Rates",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "4000 + 900 + 90 + 6 =",
        "correctAnswer": "4996",
        "explanation": "The correct answer is 4996.",
        "topic": "Place Value to 10,000",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "8 0 5 6 + 9 3 5",
        "correctAnswer": "8991",
        "explanation": "8 0 5 6 + 9 3 5 = 8991.",
        "topic": "Add 4-Digit Numbers",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "What fraction equals 0.5 ?",
        "correctAnswer": "5/10",
        "explanation": "The correct answer is 5/10.",
        "topic": "Tenths as Fractions & Decimals",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "Start Columns and rows are numbered 1 to 6. The square slides 1 square right and 1 square up. It is now in column and row .",
        "correctAnswer": "5, 1",
        "explanation": "The correct answer is 5, 1.",
        "topic": "Translations & Reflections",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w39-s11",
    "questions": [
      {
        "number": 1,
        "prompt": "9,743 6,779",
        "correctAnswer": ">",
        "explanation": "The correct answer is >.",
        "topic": "Compare & Order to 10,000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "What fraction of the shape is shaded?",
        "correctAnswer": "5/6",
        "explanation": "The correct answer is 5/6.",
        "topic": "Fractions: Halves to Tenths",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Playground Votes 7 3 16 Swings Slide Climber How many more are there for Swings than for Slide ?",
        "correctAnswer": "4",
        "explanation": "The correct answer is 4.",
        "topic": "Bar Graphs, Pictographs & Line Plots",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s01",
    "questions": [
      {
        "number": 1,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$4.35",
        "explanation": "The correct answer is $4.35.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$5.10",
        "explanation": "The correct answer is $5.10.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$6.20",
        "explanation": "The correct answer is $6.20.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$3.05",
        "explanation": "The correct answer is $3.05.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$3.30",
        "explanation": "The correct answer is $3.30.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$1.45",
        "explanation": "The correct answer is $1.45.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$0.45",
        "explanation": "The correct answer is $0.45.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s02",
    "questions": [
      {
        "number": 1,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$2.35",
        "explanation": "The correct answer is $2.35.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "A book costs $3.75 . Mia pays with a $5 bill. Her change is .",
        "correctAnswer": "$1.25",
        "explanation": "The correct answer is $1.25.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "A water bottle costs $1.75 . Mia pays with a $5 bill. Her change is .",
        "correctAnswer": "$3.25",
        "explanation": "The correct answer is $3.25.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "A toy car costs $2.75 . Mia pays with a $5 bill. Her change is .",
        "correctAnswer": "$2.25",
        "explanation": "The correct answer is $2.25.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "A water bottle costs $7.50 . Mia pays with a $10 bill. Her change is .",
        "correctAnswer": "$2.50",
        "explanation": "The correct answer is $2.50.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "A book costs $2.25 . Mia pays with a $5 bill. Her change is .",
        "correctAnswer": "$2.75",
        "explanation": "The correct answer is $2.75.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "A soccer ball costs $3.50 . Mia pays with a $5 bill. Her change is .",
        "correctAnswer": "$1.50",
        "explanation": "The correct answer is $1.50.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 8,
        "prompt": "Which coins make exactly $2.25 ? A B C D E",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 9,
        "prompt": "Which coins make exactly $1.50 ? A B C D E",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s03",
    "questions": [
      {
        "number": 1,
        "prompt": "Which coins make exactly $2.75 ? A B C D E",
        "correctAnswer": "E",
        "explanation": "The correct answer is E.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Which coins make exactly $1.75 ? A B C D E",
        "correctAnswer": "E",
        "explanation": "The correct answer is E.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which coins make exactly $1.40 ? A B C D E",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s04",
    "questions": [
      {
        "number": 1,
        "prompt": "Which coins make exactly $0.85 ? A B C D E",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "$5 How much money is shown in all?",
        "correctAnswer": "$6.05",
        "explanation": "The correct answer is $6.05.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "$5 How much money is shown in all?",
        "correctAnswer": "$5.30",
        "explanation": "The correct answer is $5.30.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "$5 How much money is shown in all?",
        "correctAnswer": "$5.20",
        "explanation": "The correct answer is $5.20.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "$20 How much money is shown in all?",
        "correctAnswer": "$22.30",
        "explanation": "The correct answer is $22.30.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "Which choice wastes money? A Comparing prices before buying B Saving $2 every week C Buying snacks every day until the money is gone",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s05",
    "questions": [
      {
        "number": 1,
        "prompt": "Which is the best reason to save money? A To buy everything you see B To have money for something big later C To impress friends",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 2,
        "prompt": "Leo wants a $60 video game and gets $10 a week. What should he do? A Buy it now even though he cannot afford it B Save for 6 weeks, then buy it C Give up and spend the money on can…",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 3,
        "prompt": "Which shows good saving? A Borrowing money for toys B Spending all allowance on snacks C Putting $5 of allowance into savings each week",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 4,
        "prompt": "Mia gets $20 for her birthday. What is the smartest choice? A Buy a toy she does not want B Spend it all on candy today C Save $10 and spend $10 on something she needs",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 5,
        "prompt": "Mia sees a toy on sale but does not need it. The smart choice is… A Buy two before the sale ends B Wait and keep saving her money C Buy it because it is on sale",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 6,
        "prompt": "A hockey puck costs $4.50 . You pay with a $10 bill. Your change is __.",
        "correctAnswer": "$5.50",
        "explanation": "The correct answer is $5.50.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      },
      {
        "number": 7,
        "prompt": "Mia saved $15 . She spends $6.25 on a book. She has __ left.",
        "correctAnswer": "$8.75",
        "explanation": "The correct answer is $8.75.",
        "topic": "Making Change & Money Choices",
        "isReview": false
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s06",
    "questions": [
      {
        "number": 1,
        "prompt": "Leo wants a $60 video game and gets $10 a week. What should he do? A Buy it now even though he cannot afford it B Save for 6 weeks, then buy it C Give up and spend the money on can…",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Making Change & Money Choices",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Which coins make exactly $2.25 ? A B C D E",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Making Change & Money Choices",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Mia gets $20 for her birthday. What is the smartest choice? A Buy a toy she does not want B Spend it all on candy today C Save $10 and spend $10 on something she needs",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Making Change & Money Choices",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s07",
    "questions": [
      {
        "number": 1,
        "prompt": "Which choice wastes money? A Comparing prices before buying B Saving $2 every week C Buying snacks every day until the money is gone",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Making Change & Money Choices",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Which coins make exactly $1.40 ? A B C D E",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Making Change & Money Choices",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Count the coins. How much money is shown?",
        "correctAnswer": "$4.35",
        "explanation": "The correct answer is $4.35.",
        "topic": "Making Change & Money Choices",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "A toy car costs $2.75 . Mia pays with a $5 bill. Her change is .",
        "correctAnswer": "$2.25",
        "explanation": "The correct answer is $2.25.",
        "topic": "Making Change & Money Choices",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "A book costs $3.75 . Mia pays with a $5 bill. Her change is .",
        "correctAnswer": "$1.25",
        "explanation": "The correct answer is $1.25.",
        "topic": "Making Change & Money Choices",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s08",
    "questions": [
      {
        "number": 1,
        "prompt": "A rectangle is 9 cm by 4 cm . Its area is __ square centimetres.",
        "correctAnswer": "36",
        "explanation": "The correct answer is 36.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Area is measured in square units. T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "A rectangle is 8 cm by 10 cm . Its area is __ square centimetres.",
        "correctAnswer": "80",
        "explanation": "The correct answer is 80.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Which of these is a straight angle? A 180° B 90° C 45°",
        "correctAnswer": "A",
        "explanation": "The correct answer is A.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "An angle that measures 155° is .",
        "correctAnswer": "obtuse",
        "explanation": "The correct answer is obtuse.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "A rectangle is 6 cm by 10 cm . Its area is __ square centimetres.",
        "correctAnswer": "60",
        "explanation": "The correct answer is 60.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 7,
        "prompt": "What is the area of a 12 cm by 4 cm rectangle? (square centimetres) A 60 B 58 C 48 D 52",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Area of Rectangles",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s09",
    "questions": [
      {
        "number": 1,
        "prompt": "Which of these is a obtuse angle? A 90° B 25° C 115°",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Which angle is obtuse ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Which angle is acute ? A B C",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Classify Angles",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "A rectangle is 8 cm by 8 cm . Its area is __ square centimetres.",
        "correctAnswer": "64",
        "explanation": "The correct answer is 64.",
        "topic": "Area of Rectangles",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "Which angle is acute ? A B C",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Classify Angles",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s10",
    "questions": [
      {
        "number": 1,
        "prompt": "What fraction of the shape is shaded?",
        "correctAnswer": "8/10",
        "explanation": "The correct answer is 8/10.",
        "topic": "Fractions: Halves to Tenths",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "Write 5,636 in words:",
        "correctAnswer": "five thousand six hundred thirty-six",
        "explanation": "The correct answer is five thousand six hundred thirty-six.",
        "topic": "Place Value to 10,000",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "2 L 1,800 mL",
        "correctAnswer": ">",
        "explanation": "The correct answer is >.",
        "topic": "Mass (g, kg) & Capacity (mL, L)",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "Owen has 32 buttons and eats 3/4 of them. How many buttons is that?",
        "correctAnswer": "24",
        "explanation": "The correct answer is 24.",
        "topic": "Fraction Word Problems",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "2 3 8 2 − 1 1 9 1",
        "correctAnswer": "1191",
        "explanation": "2 3 8 2 − 1 1 9 1 = 1191.",
        "topic": "Subtract 4-Digit Numbers",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s11",
    "questions": [
      {
        "number": 1,
        "prompt": "7,165 3,422",
        "correctAnswer": ">",
        "explanation": "The correct answer is >.",
        "topic": "Compare & Order to 10,000",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "★ ■ ◆ ● ★ ◆ ● What shape comes next? A ◆ B ■ C ▲ D ●",
        "correctAnswer": "B",
        "explanation": "The correct answer is B.",
        "topic": "Repeating & Growing Patterns",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "The least of 8/10, 3/10, 6/10 is",
        "correctAnswer": "3/10",
        "explanation": "The correct answer is 3/10.",
        "topic": "Order Fractions",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "2/10 is greater than 9/10 . T True F False",
        "correctAnswer": "False",
        "explanation": "The correct answer is False.",
        "topic": "Compare Fractions",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "What is 1 ⁄ 5 of 55?",
        "correctAnswer": "11",
        "explanation": "The correct answer is 11.",
        "topic": "Unit Fractions of Whole Numbers",
        "isReview": true
      }
    ]
  },
  {
    "sheetId": "book-on-math-g4-w40-s12",
    "questions": [
      {
        "number": 1,
        "prompt": "What fraction belongs where the __ is?",
        "correctAnswer": "2/6",
        "explanation": "The correct answer is 2/6.",
        "topic": "Fractions on Number Lines",
        "isReview": true
      },
      {
        "number": 2,
        "prompt": "4/8 = 2/4 . T True F False",
        "correctAnswer": "True",
        "explanation": "The correct answer is True.",
        "topic": "Equivalent Fractions",
        "isReview": true
      },
      {
        "number": 3,
        "prompt": "Round 7,609 to the nearest 10:",
        "correctAnswer": "7610",
        "explanation": "The correct answer is 7610.",
        "topic": "Round to the Nearest 10, 100 or 1000",
        "isReview": true
      },
      {
        "number": 4,
        "prompt": "7 1 9 × 7",
        "correctAnswer": "5033",
        "explanation": "7 1 9 × 7 = 5033.",
        "topic": "Multiply 1-Digit × 3-Digit",
        "isReview": true
      },
      {
        "number": 5,
        "prompt": "What is the median of 36, 19, 33, 24, 21, 20, 2 ? A 20 B 22 C 21 D 23",
        "correctAnswer": "C",
        "explanation": "The correct answer is C.",
        "topic": "Mean, Median & Mode",
        "isReview": true
      },
      {
        "number": 6,
        "prompt": "Lucas is thinking of a number. Add 11 and you get 47 . What is the mystery number?",
        "correctAnswer": "36",
        "explanation": "The correct answer is 36.",
        "topic": "Solve Equations to 50",
        "isReview": true
      }
    ]
  }
];
