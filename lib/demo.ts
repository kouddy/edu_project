/**
 * lib/demo.ts — owns the demo dataset's lifecycle.
 *
 * `ensureDemoData` layers the demo state (past submissions and their
 * results) onto the base seed. It inserts each demo submission/result only
 * when its sheet has no submission yet, so it never resurrects a sheet the
 * parent removed and never duplicates one that was re-scanned.
 *
 * `resetWeek12Demo` / `removeSetCDemo` back the "Remove this sheet" action:
 * Week 12 reverts to its exact opening demo state; Set C disappears, as it
 * only exists once it has been scanned in.
 */

import {
  deletePhoto,
  deleteSheetRecords,
  ensureSeeded,
  listSubmissions,
  seedRecords,
} from "./store";
import {
  GINA_MATH_SETC,
  GINA_MATH_W12,
  SEED_ANSWER_KEYS,
  SEED_GRADE_RESULTS,
  SEED_SHEETS,
  SEED_SUBMISSIONS,
} from "./seed";

export function ensureDemoData(): void {
  ensureSeeded();
  // Sheets and answer keys are insert-if-absent, so this is a no-op on a
  // fresh install and backfills older databases missing them.
  seedRecords({ sheets: SEED_SHEETS, answerKeys: SEED_ANSWER_KEYS });
  for (const sub of SEED_SUBMISSIONS) {
    if (listSubmissions({ sheetId: sub.sheetId }).length > 0) continue;
    const result = SEED_GRADE_RESULTS.find((g) => g.submissionId === sub.id);
    seedRecords({
      submissions: [sub],
      gradeResults: result ? [result] : [],
    });
  }
}

/** Put Gina's Math · Week 12 back to its opening state (checks pending). */
export async function resetWeek12Demo(): Promise<void> {
  const photoKeys = deleteSheetRecords(GINA_MATH_W12);
  for (const key of photoKeys) {
    try {
      await deletePhoto(key);
    } catch {
      /* photo already gone — nothing to clean up */
    }
  }
  const sub = SEED_SUBMISSIONS.find((s) => s.id === "sub-gina-math-w12");
  const result = SEED_GRADE_RESULTS.find((g) => g.submissionId === "sub-gina-math-w12");
  if (sub && result) {
    seedRecords({ submissions: [sub], gradeResults: [result] });
  }
}

/** Remove Math · Set C entirely (it only exists once scanned in). */
export async function removeSetCDemo(): Promise<void> {
  const photoKeys = deleteSheetRecords(GINA_MATH_SETC);
  for (const key of photoKeys) {
    try {
      await deletePhoto(key);
    } catch {
      /* photo already gone — nothing to clean up */
    }
  }
}
