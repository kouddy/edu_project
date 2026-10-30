/**
 * lib/grade-contract.ts — the wire contract between the parent app and the
 * grading API. Pure types, shared by client and server code.
 *
 * The client sends photos + minimal kid context only. Answer keys never
 * travel from the client: the server looks them up by printed code in its
 * own registry (lib/server/registry.ts).
 *
 * A job's result is a list of
 * per-photo outcomes, not a single all-or-nothing verdict — batches
 * succeed partially, failed photos are retried inside the job, and a
 * question can be marked "no answer" (blank) as its own signal.
 */

import type { AnswerKeyQuestion, QuestionGradeMeta, Verdict } from "./store";

export interface KidContext {
  id: string;
  name: string;
  grade: number;
}

export interface GradeRequestPayload {
  /** Staged photos as data URLs (`data:image/...;base64,...`). */
  photos: string[];
  /** The account's kids, used only to disambiguate whose sheet this is. */
  kidContext: KidContext[];
}

export interface ApiQuestionGrade {
  questionNumber: number;
  verdict: Verdict;
  confidence: number;
  readAnswer: string | null;
  meta?: QuestionGradeMeta;
}

/**
 * The sheet's catalogue entry, sent with a graded result so a device
 * that has never seen this sheet (a guest account scanning from
 * scratch) can file it locally under its own kid of the same grade.
 */
export interface ApiSheetSpec {
  kidGrade: number;
  subject: string;
  week: number;
  setName?: string;
  topic: string;
  questions: AnswerKeyQuestion[];
}

export interface ApiSheetResult {
  sheetId: string;
  kidId: string;
  printedCode: string;
  /** Registry version of the answer key this was graded against. */
  keyVersion: number;
  perQuestion: ApiQuestionGrade[];
  spec?: ApiSheetSpec;
}

interface GradeTrace {
  provider: string;
  model: string;
  /** Parent-language step labels the run went through. */
  steps: string[];
  note?: string;
}

/**
 * How one photo in a job ended. `already-final` is NOT a
 * server outcome — it is decided by the client at apply time, against the
 * sheet's stored state.
 */
export type PhotoOutcomeKind =
  | "graded"
  | "duplicate"
  | "rejected-deterministic"
  | "rejected-read"
  | "failed";

export interface PhotoOutcome {
  photoIndex: number;
  kind: PhotoOutcomeKind;
  /** For graded/duplicate: the sheet this photo belongs to. */
  sheetId?: string;
  /** Parent-language reason, for rejected/failed outcomes. */
  reason?: string;
  /** How many grading attempts this photo used (1–3). */
  attempts: number;
}

export interface GradeJobResult {
  outcome: "completed";
  /** One result per graded photo (duplicates appear only as outcomes). */
  sheets: ApiSheetResult[];
  photoOutcomes: PhotoOutcome[];
  trace: GradeTrace;
}

export type GradeJobStatusValue = "running" | "done" | "failed";

/** Live per-photo progress for the Home Marking card. */
export interface PhotoProgress {
  index: number;
  state: "marking" | "marked" | "settled";
  /** "Gina · Math · Week 12" once the photo has been identified. */
  sheetLabel?: string;
  /** Current parent-language step for this photo, while marking. */
  step?: string;
}

export interface GradeJobStatus {
  status: GradeJobStatusValue;
  /** Current (or final) step label, in parent language. */
  step: string;
  photoProgress?: PhotoProgress[];
  result?: GradeJobResult;
  error?: string;
}
