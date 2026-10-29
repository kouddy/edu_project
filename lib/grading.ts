/**
 * lib/grading.ts — the ONE place staged photos become grade results.
 *
 * Stage 2 ships a local mock behind this function so the whole parent flow
 * can be exercised end to end. Stage 3 replaces the body with the real
 * `/api/grade` call — the signature and the shape of what it writes to the
 * store stay the same.
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
  saveGradeResult,
  updateSubmission,
} from "./store";
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

export async function gradeStagedPhotos(photoKeys: string[]): Promise<MockGradeOutcome> {
  if (photoKeys.length === 0) return { markedSheets: 0 };

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

/** The latest Week 12 submission, if any (used by demo helpers/tests). */
export function latestWeek12Submission() {
  return getLatestSubmissionForSheet(GINA_MATH_W12);
}
