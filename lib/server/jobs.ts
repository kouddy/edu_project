/**
 * lib/server/jobs.ts — in-memory grading jobs.
 *
 * A harness run takes tens of seconds, so POST /api/grade starts a job and
 * the client polls GET /api/grade/:jobId. Jobs live in a process-global map:
 * right for the hackathon's single-instance dev/demo server, and the seam
 * where a real queue/store goes later. Jobs are not persisted — a restart
 * fails in-flight jobs, and the client falls back to its local mock.
 */

import type { GradeJobResult, GradeJobStatusValue } from "../grade-contract";

export interface GradeJob {
  id: string;
  status: GradeJobStatusValue;
  step: string;
  result?: GradeJobResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

type GlobalWithJobs = typeof globalThis & { __gradeJobs?: Map<string, GradeJob> };
const globalRef = globalThis as GlobalWithJobs;
const jobs: Map<string, GradeJob> = (globalRef.__gradeJobs ??= new Map());

export function createJob(): GradeJob {
  const job: GradeJob = {
    id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    status: "running",
    step: "Reading the sheet",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): GradeJob | null {
  return jobs.get(id) ?? null;
}

export function updateJob(id: string, patch: Partial<Omit<GradeJob, "id">>): void {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}
