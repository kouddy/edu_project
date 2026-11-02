/**
 * lib/server/guidance.ts — animated guidance for wrong answers:
 * orchestration over the task stores.
 *
 * The lifecycle lives in the stores (lib/server/guidance-store.ts):
 * a question's task is enqueued when a sheet settles with a wrong
 * answer (or lazily, when its Results are opened), the worker
 * (lib/server/guidance-worker.ts) claims and processes it, and a
 * ready artefact is served from storage from then on. This module
 * owns the parts that need the registry: resolving a question,
 * choosing the backend for the caller's mode, gating artefact reads
 * by account ownership in live mode, and the processing unit itself
 * — harness session, then the deterministic gate (the
 * guidance-animation skill's scripts/guidance-verify.ts) — which
 * the worker runs.
 *
 * Unsure answers never enqueue: guidance built on a misread number
 * would teach the wrong lesson. Enqueueing is fire-and-forget —
 * grading never waits on guidance.
 */

import type { ApiQuestionGrade } from "../grade-contract";
import {
  dbGuidanceStore,
  memoryGuidanceStore,
  type GuidanceStore,
  type GuidanceTask,
  type GuidanceView,
} from "./guidance-store";
import {
  validatePracticeQuestions,
  verifyAnimation,
} from "./pi/skills/guidance-animation/scripts/guidance-verify";
import type { PracticeQuestion } from "./guidance-store";
import { findByPrintedCode, type RegistryEntry } from "./registry";
import { supabaseForToken } from "./supabase";

/** Freshly-graded questions jump the queue over lazy/backfill ones. */
const FRESH_PRIORITY = 10;

function resolveQuestion(
  printedCode: string,
  questionNumber: number,
): { entry: RegistryEntry; correctAnswer: string; prompt: string } | null {
  const entry = findByPrintedCode(printedCode);
  const question = entry?.questions.find((q) => q.number === questionNumber);
  if (!entry || !question) return null;
  return { entry, correctAnswer: question.correctAnswer, prompt: question.prompt };
}

function storeFor(live: boolean): GuidanceStore {
  // Live work belongs in the DB; when the DB backend is unavailable
  // (no service key on this server) the memory backend keeps the
  // behaviour sane rather than dropping the task.
  return live ? (dbGuidanceStore() ?? memoryGuidanceStore()) : memoryGuidanceStore();
}

async function enqueueGuidanceQuestion(
  printedCode: string,
  questionNumber: number,
  opts: { live: boolean; priority?: number; methodText?: string },
): Promise<boolean> {
  const resolved = resolveQuestion(printedCode, questionNumber);
  if (!resolved) return false;
  await storeFor(opts.live).enqueue(
    printedCode,
    questionNumber,
    resolved.entry.keyVersion,
    opts.priority ?? 0,
    opts.methodText,
  );
  return true;
}

/** The method part of the guidance text written at grading: everything
 *  before the "Try one like it" practice prompt. The practice question
 *  is a different question — its numbers have no place in this
 *  question's lesson — so only the method rides along. */
function methodPartOf(guidance: string | undefined): string | undefined {
  if (!guidance) return undefined;
  const head = guidance.split(/\bTry one like it\b/i)[0].trim();
  return head || undefined;
}

/** Enqueue guidance for every final wrong answer on a settled sheet. */
export function enqueueGuidanceForSheet(
  printedCode: string,
  perQuestion: ApiQuestionGrade[],
  opts: { live: boolean },
): void {
  for (const g of perQuestion) {
    if (g.verdict !== "wrong") continue;
    void enqueueGuidanceQuestion(printedCode, g.questionNumber, {
      live: opts.live,
      priority: FRESH_PRIORITY,
      methodText: methodPartOf(g.meta?.guidance),
    }).catch((err) =>
      console.error("guidance enqueue failed:", err instanceof Error ? err.message : err),
    );
  }
}

export type GuidanceRead =
  | { kind: "ok"; view: GuidanceView }
  | { kind: "unknown" }
  | { kind: "forbidden" };

/** Read one question's guidance state, enqueueing lazily when no
 *  task exists yet (sheets graded before guidance existed). In live
 *  mode the artefact itself is returned only when the caller's
 *  account has a submission for the sheet — the animation contains
 *  the correct answer. */
export async function readGuidance(
  printedCode: string,
  questionNumber: number,
  auth: { token: string } | null,
): Promise<GuidanceRead> {
  const resolved = resolveQuestion(printedCode, questionNumber);
  if (!resolved) return { kind: "unknown" };
  const store = storeFor(auth !== null);
  let view = await store.get(printedCode, questionNumber, resolved.entry.keyVersion);
  if (!view) {
    await store.enqueue(printedCode, questionNumber, resolved.entry.keyVersion, 0);
    view = { status: "generating" };
  }
  if (auth && view.status === "ready") {
    const db = supabaseForToken(auth.token);
    const { data } = db
      ? await db.from("submissions").select("id").eq("sheet_code", printedCode).limit(1)
      : { data: null };
    if (!data || data.length === 0) return { kind: "forbidden" };
  }
  return { kind: "ok", view };
}

/* ------------------------------------------------------- processing */

/** The worker's unit of work: generate one question's animation
 *  and its practice questions through the harness, then run the
 *  gate on what the session submitted — nothing is stored on the
 *  agent's say-so alone. Resolves with the verified artefact;
 *  throws with the reason. */
export async function processGuidanceTask(
  task: GuidanceTask,
): Promise<{ html: string; practice: PracticeQuestion[] }> {
  const resolved = resolveQuestion(task.printedCode, task.questionNumber);
  if (!resolved) throw new Error("The question is no longer in the registry.");
  if (resolved.entry.keyVersion !== task.keyVersion) {
    throw new Error("The answer key changed since this task was queued.");
  }
  const { generateGuidanceWithHarness } = await import("./pi-guidance");
  const { html, practice } = await generateGuidanceWithHarness({
    questionPrompt: resolved.prompt,
    correctAnswer: resolved.correctAnswer,
    methodText: task.methodText ?? undefined,
    failureNote:
      task.attempts > 0 && task.lastError ? task.lastError : undefined,
    tag: `guidance ${task.printedCode}#${task.questionNumber}`,
  });
  const verdict = await verifyAnimation(html, resolved.correctAnswer);
  if (!verdict.ok) throw new Error(verdict.detail);
  const practiceVerdict = validatePracticeQuestions(practice, resolved.prompt);
  if (!practiceVerdict.ok) throw new Error(practiceVerdict.detail);
  return { html, practice };
}
