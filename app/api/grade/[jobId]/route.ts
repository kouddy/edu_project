/**
 * GET /api/grade/:jobId — poll a grading job's progress and result.
 * Returns the GradeJobStatus contract: { status, step, result?, error? }.
 */

import { NextResponse } from "next/server";
import type { GradeJobStatus } from "@/lib/grade-contract";
import { getJob } from "@/lib/server/jobs";


export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "No such grading job." }, { status: 404 });
  }
  const body: GradeJobStatus = {
    status: job.status,
    step: job.step,
    photoProgress: job.photoProgress,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
  return NextResponse.json(body);
}
