/**
 * POST /api/guidance/generate — queue (or explicitly re-queue) the
 * guidance task for one question. Body: { printedCode,
 * questionNumber }. A task that already exists is left alone, except
 * a terminally failed one, which returns to pending with its
 * attempts reset — the regenerate path. With a bearer token the
 * task lives in the database (live); without one, in memory (demo).
 */

import { NextResponse } from "next/server";
import { regenerateGuidance } from "@/lib/server/guidance";
import { bearerToken, parentFromToken } from "@/lib/server/supabase";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    printedCode?: string;
    questionNumber?: number;
  } | null;
  if (!body?.printedCode || typeof body.questionNumber !== "number") {
    return NextResponse.json(
      { error: "printedCode and questionNumber are required." },
      { status: 400 },
    );
  }
  const token = bearerToken(req);
  let auth: { token: string } | null = null;
  if (token) {
    const parent = await parentFromToken(token);
    if (!parent) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    auth = { token };
  }
  const queued = await regenerateGuidance(body.printedCode, body.questionNumber, auth);
  if (!queued) {
    return NextResponse.json({ error: "No such question." }, { status: 404 });
  }
  return NextResponse.json({
    key: `${body.printedCode}#${body.questionNumber}`,
    status: "generating",
  });
}
