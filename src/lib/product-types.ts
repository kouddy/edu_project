// Canonical product-model types (SPEC_2).
//
// These are the future-facing domain types. The legacy server-side MVP model
// (Attempt / Sheet-with-answerKey in `src/lib/types.ts`) still backs the
// /api/* routes and will be migrated onto the Store interface later.
// New UI code should import these types, never the legacy ones.

export interface Child {
  id: string;
  name: string;
  grade: number;
}

export interface SheetQuestion {
  questionNumber: number;
  prompt: string;
  correctAnswer: string;
  topic: string;
}

export interface Sheet {
  sheetCode: string;
  grade: number;
  subject: string;
  /** Week label, e.g. "week-1". Kept as a string so plans like "2026-W44" also fit. */
  week: string;
  questions: SheetQuestion[];
}

export type SubmissionStatus = "uploaded" | "graded" | "rejected" | "failed";

export interface Submission {
  id: string;
  childId: string;
  sheetCode: string;
  /** Opaque key for the photo bytes, which live in IndexedDB (see browser-store). */
  photoId: string;
  status: SubmissionStatus;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** Parent-visible note, e.g. why a photo was rejected or grading failed. */
  message?: string;
}

export type QuestionVerdict = "correct" | "incorrect" | "unsure";

export interface GradedQuestionResult {
  questionNumber: number;
  correct: boolean;
  /** What the grader read in the child's handwriting, when legible. */
  modelReading: string | null;
  /** Kid-friendly explanation for wrong answers; omitted when correct. */
  explanation?: string;
  /** Raw grader verdict; "unsure" means a parent must check (correct=false). */
  verdict: QuestionVerdict;
  /** Model confidence 0..1. Anything below 0.8 is forced to "unsure". */
  confidence: number;
}

export interface GradedResult {
  submissionId: string;
  perQuestion: GradedQuestionResult[];
  /** Fraction correct, 0..1. */
  score: number;
  /** ISO-8601 timestamp. */
  gradedAt: string;
}

export interface ReviewItem {
  childId: string;
  topic: string;
  sourceSheetCode: string;
  /** ISO-8601 timestamp when this topic becomes due for review. */
  dueAt: string;
  /** Spaced-repetition stage: 0 = due in 1 day, 1 = due in 1 week, 2 = due in 1 month. */
  intervalStage: number;
}
