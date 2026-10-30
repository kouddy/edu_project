/**
 * POST /api/grade — start a grading job.
 *
 * Body: { photos: string[] (data URLs), kidContext: KidContext[] }.
 * Answer keys are never accepted from the client — the server looks them up
 * by printed code in its own registry. Returns 202 { jobId }; poll
 * GET /api/grade/:jobId for progress and the result.
 */

import { NextResponse } from "next/server";
import type { KidContext } from "@/lib/grade-contract";
import { startGradeJob } from "@/lib/server/run-grade";


const MAX_TOTAL_PHOTO_CHARS = 30_000_000;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const record = (body ?? {}) as { photos?: unknown; kidContext?: unknown };
  const photos = Array.isArray(record.photos)
    ? record.photos.filter(
        (p): p is string => typeof p === "string" && p.startsWith("data:image/"),
      )
    : [];
  // No cap on how many photos a batch may hold — a full packet is a
  // dozen sheets or more, and grading is background work. The total
  // payload size below is the only guard.
  if (photos.length === 0) {
    return NextResponse.json({ error: "Send at least one photo." }, { status: 400 });
  }
  const totalChars = photos.reduce((n, p) => n + p.length, 0);
  if (totalChars > MAX_TOTAL_PHOTO_CHARS) {
    return NextResponse.json({ error: "Photos are too large." }, { status: 413 });
  }

  const kidContext: KidContext[] = Array.isArray(record.kidContext)
    ? record.kidContext
        .filter(
          (k): k is KidContext =>
            typeof k === "object" &&
            k !== null &&
            typeof (k as KidContext).id === "string" &&
            typeof (k as KidContext).name === "string" &&
            typeof (k as KidContext).grade === "number",
        )
        .map((k) => ({ id: k.id, name: k.name, grade: k.grade }))
    : [];

  const job = startGradeJob({ photos, kidContext });
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
