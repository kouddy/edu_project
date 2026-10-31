/**
 * lib/grading.ts — the ONE place staged photos become grade results.
 *
 * Grading is background work.
 * `dispatchGrading` sends the batch to the server (POST /api/grade) and
 * records a pending job in the store; `pollPendingJobs` — driven by the
 * app shell — collects finished jobs and applies their per-photo
 * outcomes. There is deliberately NO on-device fallback: if grading
 * fails, the parent is told plainly and the photos go back to the tray,
 * rather than being shown demo results dressed up as a real grade.
 *
 * Apply-time rules: a graded sheet replaces its previous result only
 * while that result is unfinished (checks outstanding). A final result
 * is a record — a rescan is reported as already-final and never
 * overwrites it.
 */

import {
  addPendingJob,
  addSheet,
  createSubmission,
  deletePhoto,
  deleteSheetRecords,
  getActiveMode,
  getGradeResultForSubmission,
  getLatestSubmissionForSheet,
  getPhoto,
  getSheet,
  listCheckResolutions,
  listKids,
  listPendingJobs,
  removePendingJob,
  saveGradeResult,
  setAnswerKey,
  sheetLabel,
  updatePendingJob,
  type PendingGradeJob,
} from "./store";
import type { ApiSheetResult, GradeJobResult, GradeJobStatus } from "./grade-contract";
import { getAccessToken } from "./supabase-client";

/** Parent-language message for a grading failure, whatever the cause. */
const FAILED_MESSAGE = "We couldn't mark the sheet just now — please try again in a moment.";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function photosPayload(photoKeys: string[]): Promise<string[] | null> {
  const photos: string[] = [];
  for (const key of photoKeys) {
    const blob = await getPhoto(key);
    if (!blob) return null;
    photos.push(await blobToDataUrl(blob));
  }
  return photos;
}

function kidContextPayload() {
  return listKids().map((k) => ({ id: k.id, name: k.name, grade: k.grade }));
}

async function postGradeJob(photoKeys: string[]): Promise<string | null> {
  const photos = await photosPayload(photoKeys);
  if (!photos) return null;
  try {
    // In live mode the batch is graded as the signed-in parent, so the
    // server can persist the results to their account.
    const token = getActiveMode() === "live" ? await getAccessToken() : null;
    const res = await fetch("/api/grade", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ photos, kidContext: kidContextPayload() }),
    });
    if (!res.ok) return null;
    const { jobId } = (await res.json()) as { jobId?: string };
    return jobId ?? null;
  } catch {
    return null;
  }
}

/** "Amy · Math · Week 40" / "Bob · Math · Week 40" for a sheet, from the
 *  local store (base label is lib/store.ts's sheetLabel). */
function kidSheetLabel(sheetId: string): string {
  const sheet = getSheet(sheetId);
  if (!sheet) return "a sheet";
  const kid = listKids().find((k) => k.id === sheet.kidId);
  return `${kid ? `${kid.name} · ` : ""}${sheetLabel(sheet)}`;
}

/* ------------------------------------------------------------ dispatch */

export interface DispatchOutcome {
  jobId?: string;
  failedReason?: string;
}

/**
 * Send a batch of staged photos to the grading API and record the
 * pending job. The photos stay in IndexedDB under the job's care until
 * the result is applied.
 */
export async function dispatchGrading(photoKeys: string[]): Promise<DispatchOutcome> {
  if (photoKeys.length === 0) return { failedReason: FAILED_MESSAGE };
  const jobId = await postGradeJob(photoKeys);
  if (!jobId) return { failedReason: FAILED_MESSAGE };
  addPendingJob({ jobId, photoKeys: [...photoKeys], submittedAt: Date.now() });
  return { jobId };
}

/* ------------------------------------------------------------ applying */

/** True when the sheet's current result is settled: graded, with every
 *  unsure question resolved by the parent. */
function sheetResultIsFinal(sheetId: string): boolean {
  const sub = getLatestSubmissionForSheet(sheetId);
  if (!sub) return false;
  const result = getGradeResultForSubmission(sub.id);
  if (!result) return false;
  const resolutions = listCheckResolutions(result.id);
  return result.perQuestion.every(
    (q) =>
      q.verdict !== "unsure" ||
      resolutions.some((r) => r.questionNumber === q.questionNumber),
  );
}

/**
 * File a graded sheet this device has no record for, using the
 * catalogue entry the server sent with the result. The sheet belongs
 * to the account's kid of the same grade — demo accounts hold no
 * seeded sheets, so every real scan arrives this way. Returns false
 * when the account has no kid (or more than one) at that grade.
 */
function fileSheetFromSpec(sheet: ApiSheetResult): boolean {
  const spec = sheet.spec;
  if (!spec) return false;
  const matches = listKids().filter((k) => k.grade === spec.kidGrade);
  if (matches.length !== 1) return false;
  addSheet({
    id: sheet.sheetId,
    kidId: matches[0].id,
    subject: spec.subject,
    week: spec.week,
    ...(spec.setName ? { setName: spec.setName } : {}),
    printedCode: sheet.printedCode,
    topic: spec.topic,
  });
  setAnswerKey({ sheetId: sheet.sheetId, questions: spec.questions });
  return true;
}

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

interface SettledBatch {
  jobId: string;
  markedSheets: number;
  /** Parent-language summary lines (already-final, duplicates, failures). */
  lines: string[];
  /** Photo keys returned to the tray for a retake. */
  trayPhotoKeys: string[];
}

async function applyJobResult(
  job: PendingGradeJob,
  status: GradeJobStatus,
  result: GradeJobResult,
): Promise<SettledBatch> {
  const batch: SettledBatch = { jobId: job.jobId, markedSheets: 0, lines: [], trayPhotoKeys: [] };
  const sheetsById = new Map(result.sheets.map((s) => [s.sheetId, s]));
  const progressByIndex = new Map((status.photoProgress ?? []).map((p) => [p.index, p]));

  for (const outcome of result.photoOutcomes) {
    const photoKey = job.photoKeys[outcome.photoIndex];
    if (!photoKey) continue;
    const progressLabel = progressByIndex.get(outcome.photoIndex)?.sheetLabel;

    if (outcome.kind === "graded" && outcome.sheetId) {
      const sheet = sheetsById.get(outcome.sheetId);
      if (!sheet) continue;
      if (!getSheet(outcome.sheetId) && !fileSheetFromSpec(sheet)) {
        // The server marked a sheet this device cannot file — its
        // grade matches none of the account's kids, so there is no
        // one to file it under. Say so plainly instead of dropping it.
        batch.lines.push(
          `${progressLabel ?? "That sheet"} isn't in the app yet, so we couldn't file the result.`,
        );
        await deletePhoto(photoKey).catch(() => {});
        continue;
      }
      if (sheetResultIsFinal(outcome.sheetId)) {
        batch.lines.push(
          `${kidSheetLabel(outcome.sheetId)} already has its finished result, so we kept it as is.`,
        );
        await deletePhoto(photoKey).catch(() => {});
        continue;
      }
      await replaceSheetSubmission(outcome.sheetId, [photoKey]);
      const sub = createSubmission({ sheetId: outcome.sheetId, photoKeys: [photoKey] });
      saveGradeResult({
        submissionId: sub.id,
        sheetId: outcome.sheetId,
        perQuestion: sheet.perQuestion.map((q) => ({
          questionNumber: q.questionNumber,
          verdict: q.verdict,
          confidence: q.confidence,
          readAnswer: q.readAnswer,
          ...(q.meta ? { meta: q.meta } : {}),
        })),
      });
      batch.markedSheets++;
      continue;
    }

    if (outcome.kind === "duplicate") {
      const label = outcome.sheetId ? kidSheetLabel(outcome.sheetId) : (progressLabel ?? "the same sheet");
      batch.lines.push(`Two photos look like ${label} — we marked it once.`);
      await deletePhoto(photoKey).catch(() => {});
      continue;
    }

    // Rejected or failed after all attempts: the photo goes back to the
    // tray, with a named, plain-language line in the summary.
    batch.trayPhotoKeys.push(photoKey);
    const label = outcome.sheetId
      ? kidSheetLabel(outcome.sheetId)
      : (progressLabel ?? `Photo ${outcome.photoIndex + 1}`);
    if (outcome.kind === "rejected-deterministic") {
      batch.lines.push(`${label}: ${outcome.reason ?? "We couldn't mark that sheet."} It's in your tray.`);
    } else if (outcome.kind === "rejected-read") {
      batch.lines.push(`${label} couldn't be read — it's in your tray to retake.`);
    } else {
      batch.lines.push(`${label} couldn't be marked just now — it's in your tray to try again.`);
    }
  }
  return batch;
}

/* ------------------------------------------------------------ polling */

export interface PollResult {
  settled: SettledBatch[];
  /** Latest statuses of jobs still running, for the Marking card. */
  running: GradeJobStatus[];
}

/**
 * One polling pass over all pending jobs. Finished jobs are applied and
 * removed; a job the server has lost is resubmitted from its stored
 * photos; a job-level failure settles with every photo
 * returned to the tray.
 */
export async function pollPendingJobs(): Promise<PollResult> {
  const settled: SettledBatch[] = [];
  const running: GradeJobStatus[] = [];

  for (const job of listPendingJobs()) {
    let status: GradeJobStatus | null = null;
    let notFound = false;
    try {
      const res = await fetch(`/api/grade/${job.jobId}`);
      if (res.status === 404) notFound = true;
      else if (res.ok) status = (await res.json()) as GradeJobStatus;
    } catch {
      /* network blip — treat as still running, retry next pass */
    }

    if (notFound) {
      // The server lost the job (it keeps jobs in memory). Resubmit the
      // same photos under a new job id; if the photos themselves are
      // gone, settle honestly with the tray restore.
      const newJobId = await postGradeJob(job.photoKeys);
      if (newJobId) {
        updatePendingJob(job.jobId, { jobId: newJobId });
        running.push({ status: "running", step: "Reading the sheet" });
      } else {
        removePendingJob(job.jobId);
        settled.push({
          jobId: job.jobId,
          markedSheets: 0,
          lines: ["We couldn't mark those sheets just now — the photos are back in your tray to try again."],
          trayPhotoKeys: [...job.photoKeys],
        });
      }
      continue;
    }

    if (!status || status.status === "running") {
      if (status) running.push(status);
      continue;
    }

    if (status.status === "failed" || !status.result) {
      removePendingJob(job.jobId);
      settled.push({
        jobId: job.jobId,
        markedSheets: 0,
        lines: ["We couldn't mark those sheets just now — the photos are back in your tray to try again."],
        trayPhotoKeys: [...job.photoKeys],
      });
      continue;
    }

    const batch = await applyJobResult(job, status, status.result);
    removePendingJob(job.jobId);
    settled.push(batch);
  }

  return { settled, running };
}
