// Product-model grading pipeline (backs POST /api/grade).
//
// Server-only: reads the answer key from the server data layer
// (lib/store.ts) and calls the vision model with the key kept server-side.
// The client persists the returned outcome through the browser Store
// (saveGradedResult + submission status), which the server cannot reach.

import type {
  GradedQuestionResult,
  QuestionVerdict,
  Sheet,
} from "./product-types";
import { isVisionConfigured, requestVisionJson } from "./vision-client";

/** Below this confidence a verdict is forced to "unsure". Never guess. */
export const GRADE_CONFIDENCE_THRESHOLD = 0.8;

export const UNSURE_EXPLANATION =
  "I couldn't read this answer confidently, so I'm leaving it for a parent to check.";

export const DEFAULT_REJECTION_REASON =
  "I couldn't see a worksheet clearly in this photo. Please retake it showing the full page in good light.";

/** Parent-visible message when grading itself fails (after one retry). */
export const GRADING_FAILED_MESSAGE =
  "Grading didn't work this time. Please check your connection and try again.";

export function productGradingPrompt(sheet: Sheet): string {
  const key = sheet.questions
    .map(
      (q) =>
        `${q.questionNumber}. "${q.prompt}" (correct answer: "${q.correctAnswer}")`
    )
    .join("\n");
  return [
    "You are grading a child's worksheet photo. The answer key is provided.",
    "Return JSON only, no prose.",
    'If no worksheet is visible, or the photo is too blurry/cropped to grade, return {"photo_rejected": true, "reason": "..."} with the reason in plain language a parent would understand.',
    'Otherwise return {"results": [{"question_number": N, "answer_read": "what the child wrote, or null", "verdict": "correct|incorrect|unsure", "confidence": 0-1, "explanation": "..."}]}.',
    "Explanation is only for incorrect: one short, kind, kid-friendly sentence explaining the mistake.",
    "Rules: if you are not at least 80% sure what the child wrote, verdict must be unsure - never guess.",
    "Crossed-out or overwritten answers are unsure unless one answer is clearly final.",
    `Answer key:\n${key}`,
  ].join("\n");
}

export interface ProductGradeSuccess {
  rejected: false;
  perQuestion: GradedQuestionResult[];
  /** Fraction correct among confident (correct/incorrect) verdicts only. */
  score: number;
}

export interface ProductGradeRejection {
  rejected: true;
  reason: string;
}

export type ProductGradeOutcome = ProductGradeSuccess | ProductGradeRejection;

/** Fraction correct counting only confident verdicts; 0 when there are none. */
export function scoreConfident(perQuestion: GradedQuestionResult[]): number {
  const decisive = perQuestion.filter((q) => q.verdict !== "unsure");
  if (decisive.length === 0) return 0;
  const correct = decisive.filter((q) => q.verdict === "correct").length;
  return Math.round((correct / decisive.length) * 1000) / 1000;
}

interface RawVerdict {
  question_number?: unknown;
  answer_read?: unknown;
  verdict?: unknown;
  confidence?: unknown;
  explanation?: unknown;
}

function toUnsure(n: number, reading: string | null): GradedQuestionResult {
  return {
    questionNumber: n,
    correct: false,
    modelReading: reading,
    explanation: UNSURE_EXPLANATION,
    verdict: "unsure",
    confidence: 0,
  };
}

/**
 * Validate the model's payload and enforce the never-guess rule server-side:
 * unknown shapes, missing questions, invalid verdicts, and confidence below
 * 0.8 all become "unsure". Accepts a bare results array leniently.
 */
export function parseProductPayload(
  data: unknown,
  questionCount: number
): ProductGradeOutcome {
  const rawItems = Array.isArray(data)
    ? data
    : (data as { results?: unknown } | null)?.results;
  if (!Array.isArray(data)) {
    const flag = (data as { photo_rejected?: unknown } | null)?.photo_rejected;
    if (flag === true) {
      const reason = (data as { reason?: unknown })?.reason;
      return {
        rejected: true,
        reason:
          typeof reason === "string" && reason.trim()
            ? reason.trim()
            : DEFAULT_REJECTION_REASON,
      };
    }
  }
  const items = (Array.isArray(rawItems) ? rawItems : []) as RawVerdict[];

  const perQuestion: GradedQuestionResult[] = [];
  for (let n = 1; n <= questionCount; n += 1) {
    const found = items.find((i) => Number(i.question_number) === n);
    const reading =
      typeof found?.answer_read === "string" ? found.answer_read : null;
    if (!found) {
      perQuestion.push(toUnsure(n, null));
      continue;
    }
    const verdictRaw = found.verdict;
    const verdict: QuestionVerdict =
      verdictRaw === "correct" ||
      verdictRaw === "incorrect" ||
      verdictRaw === "unsure"
        ? verdictRaw
        : "unsure";
    const confidence =
      typeof found.confidence === "number" && Number.isFinite(found.confidence)
        ? Math.min(1, Math.max(0, found.confidence))
        : 0;
    if (verdict === "unsure" || confidence < GRADE_CONFIDENCE_THRESHOLD) {
      perQuestion.push({ ...toUnsure(n, reading), confidence });
      continue;
    }
    perQuestion.push({
      questionNumber: n,
      correct: verdict === "correct",
      modelReading: reading,
      explanation:
        verdict === "correct"
          ? undefined
          : typeof found.explanation === "string" && found.explanation.trim()
            ? found.explanation.trim()
            : undefined,
      verdict,
      confidence,
    });
  }
  return { rejected: false, perQuestion, score: scoreConfident(perQuestion) };
}

export interface ProductGradeCall {
  demo: boolean;
  outcome: ProductGradeOutcome;
}

function demoOutcome(questionCount: number): ProductGradeOutcome {
  const perQuestion = Array.from({ length: questionCount }, (_, i) =>
    toUnsure(i + 1, null)
  );
  return { rejected: false, perQuestion, score: 0 };
}

/**
 * Grade one photo against the sheet's answer key. Demo mode (no vision key)
 * returns all-unsure without a model call. Live mode retries the vision call
 * exactly once before throwing.
 */
export async function gradeProductPhoto(
  sheet: Sheet,
  bytes: Buffer,
  mimeType: string
): Promise<ProductGradeCall> {
  if (!isVisionConfigured()) {
    return { demo: true, outcome: demoOutcome(sheet.questions.length) };
  }
  const prompt = productGradingPrompt(sheet);
  const imageBase64 = bytes.toString("base64");
  let data: unknown;
  try {
    data = await requestVisionJson(prompt, imageBase64, mimeType);
  } catch {
    data = await requestVisionJson(prompt, imageBase64, mimeType);
  }
  return {
    demo: false,
    outcome: parseProductPayload(data, sheet.questions.length),
  };
}
