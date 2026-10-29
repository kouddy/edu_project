/**
 * lib/grade-contract.ts — the wire contract between the parent app and the
 * Stage 3 grading API. Pure types, shared by client and server code.
 *
 * The client sends photos + minimal kid context only. Answer keys never
 * travel from the client: the server looks them up by printed code in its
 * own registry (lib/server/registry.ts).
 */

import type { QuestionGradeMeta, Verdict } from "./store";

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

export interface ApiSheetResult {
  sheetId: string;
  kidId: string;
  printedCode: string;
  /** Registry version of the answer key this was graded against. */
  keyVersion: number;
  perQuestion: ApiQuestionGrade[];
}

export interface GradeTrace {
  provider: string;
  model: string;
  /** Parent-language step labels the run went through. */
  steps: string[];
  note?: string;
}

export type GradeJobResult =
  | { outcome: "graded"; sheets: ApiSheetResult[]; trace: GradeTrace }
  | { outcome: "rejected"; reason: string; trace: GradeTrace };

export type GradeJobStatusValue = "running" | "done" | "failed";

export interface GradeJobStatus {
  status: GradeJobStatusValue;
  /** Current (or final) step label, in parent language. */
  step: string;
  result?: GradeJobResult;
  error?: string;
}
