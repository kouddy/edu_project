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


const MAX_PHOTOS = 6;
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
  if (photos.length === 0 || photos.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Send between 1 and ${MAX_PHOTOS} photos.` },
      { status: 400 },
    );
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
