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
import { bearerToken, parentFromToken, supabaseAdmin, supabaseConfigured } from "@/lib/server/supabase";


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

  const job = await authorizeAndStart(req, photos, kidContext);
  if (job instanceof NextResponse) return job;
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}

/**
 * When the request carries a parent token, verify it and confirm every
 * kid it names belongs to that parent; the job is then tagged so its
 * results persist to the account. Unauthenticated requests (demo and
 * guest modes) start jobs exactly as before.
 */
async function authorizeAndStart(req: Request, photos: string[], kidContext: KidContext[]) {
  const token = bearerToken(req);
  if (!token) return startGradeJob({ photos, kidContext });
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Accounts are not configured on this server." }, { status: 503 });
  }
  const parent = await parentFromToken(token);
  if (!parent) {
    return NextResponse.json({ error: "Your sign-in has expired — please sign in again." }, { status: 401 });
  }
  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Account is unavailable just now." }, { status: 503 });
  }
  if (kidContext.length > 0) {
    const { data: owned } = await admin
      .from("kids")
      .select("id")
      .eq("parent_id", parent.id)
      .in("id", kidContext.map((k) => k.id));
    if ((owned ?? []).length !== kidContext.length) {
      return NextResponse.json({ error: "Those children aren't on your account." }, { status: 403 });
    }
  }
  return startGradeJob({ photos, kidContext, accountParentId: parent.id });
}
