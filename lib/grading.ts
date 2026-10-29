/**
 * lib/grading.ts — the ONE place staged photos become grade results.
 *
 * Grading runs on the server (POST /api/grade, then poll the job): the
 * server holds the answer keys and runs the real grading harness, and this
 * client only sends photos + kid context and writes the returned verdicts
 * into the store. There is deliberately NO on-device fallback — if the API
 * is unreachable or the job fails, the parent is told plainly and keeps
 * their staged photos to try again, rather than being shown demo results
 * dressed up as a real grade. (The scripted demo provider still exists
 * server-side for development: select it with GRADING_PROVIDER=demo.)
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
import { GINA_MATH_W12 } from "./seed";

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

export interface GradeOutcome {
  /** How many sheets were marked. */
  markedSheets: number;
  /**
   * Set when the grading API rejected the photo(s) — a plain-language
   * reason from the server. The staged photos are kept so the parent can
   * retake the shot.
   */
  rejectedReason?: string;
  /**
   * Set when grading itself failed (API unreachable, job failed, timed
   * out). The staged photos are kept so the parent can try again; no
   * result is written and nothing is faked.
   */
  failedReason?: string;
}

/** Parent-language message for a grading failure, whatever the cause. */
const FAILED_MESSAGE = "We couldn't mark the sheet just now — please try again in a moment.";

/* ------------------------------------------------------------ server API */

const API_POLL_INTERVAL_MS = 500;
/** A real harness run can take a couple of minutes per photo. */
const API_TIMEOUT_MS = 240_000;

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
): Promise<GradeOutcome> {
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
 * Grade via /api/grade. Every path returns an outcome: `graded` writes the
 * real verdicts into the store, `rejected` carries the server's
 * plain-language reason, and any failure (unreachable, failed job,
 * timeout) returns a failed outcome — never a fabricated result.
 */
async function gradeViaApi(photoKeys: string[]): Promise<GradeOutcome> {
  const failed: GradeOutcome = { markedSheets: 0, failedReason: FAILED_MESSAGE };
  try {
    const photos: string[] = [];
    for (const key of photoKeys) {
      const blob = await getPhoto(key);
      if (!blob) return failed;
      photos.push(await blobToDataUrl(blob));
    }
    const kidContext = listKids().map((k) => ({ id: k.id, name: k.name, grade: k.grade }));

    const startRes = await fetch("/api/grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photos, kidContext }),
    });
    if (!startRes.ok) return failed;
    const { jobId } = (await startRes.json()) as { jobId?: string };
    if (!jobId) return failed;

    const deadline = Date.now() + API_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(API_POLL_INTERVAL_MS);
      const statusRes = await fetch(`/api/grade/${jobId}`);
      if (!statusRes.ok) return failed;
      const status = (await statusRes.json()) as GradeJobStatus;
      if (status.status === "done" && status.result?.outcome === "graded") {
        return applyApiResult(status.result, photoKeys);
      }
      if (status.status === "done" && status.result?.outcome === "rejected") {
        return { markedSheets: 0, rejectedReason: status.result.reason };
      }
      if (status.status !== "running") return failed;
    }
    return failed;
  } catch {
    return failed;
  }
}

/* ------------------------------------------------------------ entry point */

export async function gradeStagedPhotos(photoKeys: string[]): Promise<GradeOutcome> {
  if (photoKeys.length === 0) return { markedSheets: 0 };
  return gradeViaApi(photoKeys);
}

/** The latest Week 12 submission, if any (used by demo helpers/tests). */
export function latestWeek12Submission() {
  return getLatestSubmissionForSheet(GINA_MATH_W12);
}
