/**
 * lib/grading.ts — the ONE place staged photos become grade results.
 *
 * Stage 3: grading goes through the server API (POST /api/grade, then poll
 * the job) — the server holds the answer keys and runs the grading harness;
 * this client only sends photos + kid context and writes the returned
 * verdicts into the store. If the API is unreachable, the job fails, or the
 * outcome isn't a graded result, we fall back to the Stage 2 local mock
 * below so the parent flow never dead-ends (the mock reproduces the demo
 * pattern entirely on-device).
 *
 * Mock behaviour (mirrors the interactive prototype):
 * - The first staged photo is Gina's Math · Week 12: it (re)produces the
 *   demo verdict pattern — 7 correct, Q4 wrong, Q6 + Q9 "unsure".
 * - A second staged photo additionally produces Math · Set C, final at 9/10.
 * - Any further photos are kept as extra photos of the Week 12 sheet.
 */

import {
  createSubmission,
  deletePhoto,
  deleteSheetRecords,
  getLatestSubmissionForSheet,
  getPhoto,
  listKids,
  saveGradeResult,
  updateSubmission,
} from "./store";
import type { GradeJobResult, GradeJobStatus } from "./grade-contract";
import { GINA_MATH_SETC, GINA_MATH_W12, SETC_DEMO_GRADES, W12_DEMO_GRADES } from "./seed";

async function replaceSheetSubmission(sheetId: string, photoKeys: string[]): Promise<void> {
  const keep = new Set(photoKeys);
  const oldKeys = deleteSheetRecords(sheetId).filter((k) => !keep.has(k));
  for (const key of oldKeys) {
    try {
      await deletePhoto(key);
    } catch {
      /* already gone */
    }
  }
}

export interface MockGradeOutcome {
  /** How many sheets were marked (1 or 2 in this demo). */
  markedSheets: number;
}

/* ------------------------------------------------------------ server API */

const API_POLL_INTERVAL_MS = 500;
const API_TIMEOUT_MS = 30_000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Write a graded API result into the store, one submission per sheet. */
async function applyApiResult(
  result: Extract<GradeJobResult, { outcome: "graded" }>,
  photoKeys: string[],
): Promise<MockGradeOutcome> {
  let markedSheets = 0;
  for (const [i, sheet] of result.sheets.entries()) {
    const photoKey = photoKeys[i] ?? photoKeys[0];
    await replaceSheetSubmission(sheet.sheetId, [photoKey]);
    const sub = createSubmission({ sheetId: sheet.sheetId, photoKeys: [photoKey] });
    if (i === 0 && photoKeys.length > result.sheets.length) {
      // Extra photos belong to the first sheet, as in the local mock.
      updateSubmission(sub.id, { photoKeys: [...photoKeys] });
    }
    saveGradeResult({
      submissionId: sub.id,
      sheetId: sheet.sheetId,
      perQuestion: sheet.perQuestion.map((q) => ({
        questionNumber: q.questionNumber,
        verdict: q.verdict,
        confidence: q.confidence,
        readAnswer: q.readAnswer,
        ...(q.meta ? { meta: q.meta } : {}),
      })),
    });
    markedSheets++;
  }
  return { markedSheets };
}

/**
 * Grade via /api/grade. Returns null whenever the API path doesn't produce
 * a graded result (unreachable, failed job, rejected photo, timeout) — the
 * caller then falls back to the local mock. Wiring the API's `rejected`
 * outcome into the Photo rejected screen is Phase 2 work; in Phase 1 the
 * demo provider never rejects.
 */
async function gradeViaApi(photoKeys: string[]): Promise<MockGradeOutcome | null> {
  try {
    const photos: string[] = [];
    for (const key of photoKeys) {
      const blob = await getPhoto(key);
      if (!blob) return null;
      photos.push(await blobToDataUrl(blob));
    }
    const kidContext = listKids().map((k) => ({ id: k.id, name: k.name, grade: k.grade }));

    const startRes = await fetch("/api/grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photos, kidContext }),
    });
    if (!startRes.ok) return null;
    const { jobId } = (await startRes.json()) as { jobId?: string };
    if (!jobId) return null;

    const deadline = Date.now() + API_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(API_POLL_INTERVAL_MS);
      const statusRes = await fetch(`/api/grade/${jobId}`);
      if (!statusRes.ok) return null;
      const status = (await statusRes.json()) as GradeJobStatus;
      if (status.status === "done" && status.result?.outcome === "graded") {
        return applyApiResult(status.result, photoKeys);
      }
      if (status.status !== "running") return null;
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ local mock */

async function gradeLocally(photoKeys: string[]): Promise<MockGradeOutcome> {
  const [first, second, ...rest] = photoKeys;

  // Sheet 1 — Gina's Math · Week 12, demo verdict pattern.
  await replaceSheetSubmission(GINA_MATH_W12, [first]);
  const sub = createSubmission({ sheetId: GINA_MATH_W12, photoKeys: [first] });
  if (rest.length > 0) {
    updateSubmission(sub.id, { photoKeys: [first, ...rest] });
  }
  saveGradeResult({
    submissionId: sub.id,
    sheetId: GINA_MATH_W12,
    perQuestion: W12_DEMO_GRADES.map((g) => ({ ...g })),
  });

  let markedSheets = 1;

  // Sheet 2 — Math · Set C, final 9/10.
  if (second) {
    await replaceSheetSubmission(GINA_MATH_SETC, [second]);
    const subC = createSubmission({ sheetId: GINA_MATH_SETC, photoKeys: [second] });
    saveGradeResult({
      submissionId: subC.id,
      sheetId: GINA_MATH_SETC,
      perQuestion: SETC_DEMO_GRADES.map((g) => ({ ...g })),
    });
    markedSheets = 2;
  }

  return { markedSheets };
}

/* ------------------------------------------------------------ entry point */

export async function gradeStagedPhotos(photoKeys: string[]): Promise<MockGradeOutcome> {
  if (photoKeys.length === 0) return { markedSheets: 0 };
  return (await gradeViaApi(photoKeys)) ?? (await gradeLocally(photoKeys));
}

/** The latest Week 12 submission, if any (used by demo helpers/tests). */
export function latestWeek12Submission() {
  return getLatestSubmissionForSheet(GINA_MATH_W12);
}
