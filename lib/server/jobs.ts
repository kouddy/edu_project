/**
 * lib/server/jobs.ts — in-memory grading jobs.
 *
 * A harness run takes tens of seconds, so POST /api/grade starts a job and
 * the client polls GET /api/grade/:jobId. Jobs live in a process-global map:
 * right for the hackathon's single-instance dev/demo server, and the seam
 * where a real queue/store goes later. Jobs are not persisted — a server
 * restart loses them; the client notices the loss and quietly resubmits
 * the batch from the photos stored on the device.
 */

import type {
  ApiSheetResult,
  GradeJobResult,
  GradeJobStatusValue,
  PhotoOutcome,
  PhotoProgress,
} from "../grade-contract";

export interface GradeJob {
  id: string;
  status: GradeJobStatusValue;
  step: string;
  /** Live per-photo progress for the Home Marking card. */
  photoProgress: PhotoProgress[];
  /** Per-photo results published as each photo settles, so clients
   *  can file finished sheets while the rest are still marking. */
  partialSheets: ApiSheetResult[];
  partialOutcomes: PhotoOutcome[];
  result?: GradeJobResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

type GlobalWithJobs = typeof globalThis & { __gradeJobs?: Map<string, GradeJob> };
const globalRef = globalThis as GlobalWithJobs;
const jobs: Map<string, GradeJob> = (globalRef.__gradeJobs ??= new Map());

export function createJob(photoCount = 1): GradeJob {
  const job: GradeJob = {
    id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    status: "running",
    step: "Reading the sheet",
    photoProgress: Array.from({ length: photoCount }, (_, index) => ({
      index,
      state: "marking" as const,
    })),
    partialSheets: [],
    partialOutcomes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function updatePhotoProgress(id: string, index: number, patch: Partial<PhotoProgress>): void {
  const job = jobs.get(id);
  if (!job) return;
  const entry = job.photoProgress[index];
  if (!entry) return;
  Object.assign(entry, patch);
  job.updatedAt = Date.now();
}

/** Publish one photo's finished outcome (and its sheet result, when
 *  it graded) for polling clients to file early. */
export function publishPhotoResult(
  id: string,
  outcome: PhotoOutcome,
  sheet?: ApiSheetResult,
): void {
  const job = jobs.get(id);
  if (!job) return;
  job.partialOutcomes.push(outcome);
  if (sheet) job.partialSheets.push(sheet);
  job.updatedAt = Date.now();
}

export function getJob(id: string): GradeJob | null {
  return jobs.get(id) ?? null;
}

export function updateJob(id: string, patch: Partial<Omit<GradeJob, "id">>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}
