/**
 * lib/server/guidance.ts — animated guidance for wrong answers,
 * generated on demand and never on the grading path.
 *
 * When a sheet settles with a wrong answer, a guidance job is queued
 * for that question. Generation runs as a Pi harness session
 * (lib/server/pi-guidance.ts): the agent drafts a self-contained HTML
 * animation from the question's own numbers — the registry key is
 * the ground truth — previews its draft through the verifier, fixes
 * what the preview shows, and submits only what passes the gate.
 * The gate (lib/server/guidance-verify.ts) executes the artefact in
 * jsdom and steps it to its end state: no script errors, stepping
 * terminates, the final displayed answer matches the key, shapes
 * stay inside the picture. This module re-runs that gate on whatever
 * the session submits before caching it, so nothing attaches to a
 * result on the agent's say-so alone. A question whose generation
 * fails keeps its text guidance. Verified artefacts are cached per
 * question, so each question is generated at most once per server
 * run.
 */

import type { ApiQuestionGrade } from "../grade-contract";
import { verifyAnimation } from "./guidance-verify";
import { findByPrintedCode } from "./registry";

export type GuidanceStatus = "generating" | "verifying" | "ready" | "failed";

export interface GuidanceRecord {
  key: string;
  printedCode: string;
  questionNumber: number;
  status: GuidanceStatus;
  html?: string;
  error?: string;
  attempts: number;
  updatedAt: number;
}

type GlobalWithGuidance = typeof globalThis & {
  __guidance?: Map<string, GuidanceRecord>;
};
const records: Map<string, GuidanceRecord> = ((globalThis as GlobalWithGuidance).__guidance ??=
  new Map());

const MAX_GENERATION_ATTEMPTS = 2;

export function guidanceKey(printedCode: string, questionNumber: number): string {
  return `${printedCode}#${questionNumber}`;
}

export function getGuidance(
  printedCode: string,
  questionNumber: number,
): GuidanceRecord | null {
  return records.get(guidanceKey(printedCode, questionNumber)) ?? null;
}

/** Queue generation for one question. No-ops when an artefact is
 *  ready or a job is already running; a failed record re-queues only
 *  when forced (an explicit regenerate request). When `html` is
 *  supplied it skips generation and goes straight to the gate —
 *  the pre-generation and testing path. */
export function enqueueGuidance(
  printedCode: string,
  questionNumber: number,
  opts?: { html?: string; force?: boolean },
): GuidanceRecord | null {
  const entry = findByPrintedCode(printedCode);
  const question = entry?.questions.find((q) => q.number === questionNumber);
  if (!entry || !question) return null;
  const key = guidanceKey(printedCode, questionNumber);
  const existing = records.get(key);
  if (
    existing &&
    (existing.status === "ready" ||
      existing.status === "generating" ||
      existing.status === "verifying" ||
      (existing.status === "failed" && !opts?.force))
  ) {
    return existing;
  }
  const record: GuidanceRecord = {
    key,
    printedCode,
    questionNumber,
    status: opts?.html ? "verifying" : "generating",
    attempts: 0,
    updatedAt: Date.now(),
  };
  records.set(key, record);
  void runGuidanceJob(record, question.prompt, question.correctAnswer, opts?.html);
  return record;
}

/** Queue guidance for every final wrong answer on a settled sheet.
 *  Unsure answers wait for the parent's check — guidance built on a
 *  misread number would teach the wrong lesson. Fire-and-forget: a
 *  guidance failure must never surface in grading. */
export function enqueueGuidanceForSheet(
  printedCode: string,
  perQuestion: ApiQuestionGrade[],
): void {
  try {
    for (const g of perQuestion) {
      if (g.verdict === "wrong") enqueueGuidance(printedCode, g.questionNumber);
    }
  } catch (err) {
    console.error("guidance enqueue failed:", err instanceof Error ? err.message : err);
  }
}

async function runGuidanceJob(
  record: GuidanceRecord,
  prompt: string,
  correctAnswer: string,
  suppliedHtml?: string,
): Promise<void> {
  let failureNote: string | undefined;
  try {
    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      record.attempts = attempt;
      let html = suppliedHtml;
      if (!html) {
        record.status = "generating";
        record.updatedAt = Date.now();
        const { generateGuidanceWithHarness } = await import("./pi-guidance");
        html = await generateGuidanceWithHarness({
          questionPrompt: prompt,
          correctAnswer,
          failureNote,
          tag: `guidance ${record.key}`,
        });
      }
      record.status = "verifying";
      record.updatedAt = Date.now();
      const verdict = await verifyAnimation(html, correctAnswer);
      if (verdict.ok) {
        record.html = html;
        record.status = "ready";
        record.error = undefined;
        record.updatedAt = Date.now();
        console.log(`[guidance] ${record.key} ready (attempt ${attempt})`);
        return;
      }
      failureNote = verdict.detail;
      console.log(`[guidance] ${record.key} verification failed (attempt ${attempt}): ${verdict.detail}`);
      if (suppliedHtml) break; // a supplied artefact gets one verdict, no regeneration
    }
    record.status = "failed";
    record.error = failureNote ?? "Guidance generation failed.";
    record.updatedAt = Date.now();
  } catch (err) {
    record.status = "failed";
    record.error = err instanceof Error ? err.message : "Guidance generation failed.";
    record.updatedAt = Date.now();
    console.error(`[guidance] ${record.key} failed:`, record.error);
  }
}
