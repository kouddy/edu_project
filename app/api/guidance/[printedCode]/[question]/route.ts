/**
 * GET /api/guidance/:printedCode/:question — the guidance state for
 * one question. The first poll for a question with no task queues
 * its generation (so sheets graded before guidance existed are
 * covered too); the client keeps polling while the status is
 * generating and swaps the animation in when it is ready.
 *
 * Without a token the caller is a demo client and reads the memory
 * backend. With a token the caller is a live parent: the task lives
 * in the database, and the artefact itself is served only when the
 * parent's account has a submission for the sheet — an animation
 * contains the correct answer.
 */

import { NextResponse } from "next/server";
import { readGuidance } from "@/lib/server/guidance";
import { bearerToken, parentFromToken } from "@/lib/server/supabase";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ printedCode: string; question: string }> },
) {
  const { printedCode, question } = await ctx.params;
  const questionNumber = Number(question);
  const token = bearerToken(req);
  let auth: { token: string } | null = null;
  if (token) {
    const parent = await parentFromToken(token);
    if (!parent) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    auth = { token };
  }
  const read = await readGuidance(printedCode, questionNumber, auth);
  if (read.kind === "unknown") {
    return NextResponse.json({ error: "No such question." }, { status: 404 });
  }
  if (read.kind === "forbidden") {
    return NextResponse.json({ error: "That sheet is not on this account." }, { status: 403 });
  }
  return NextResponse.json({
    status: read.view.status,
    ...(read.view.status === "ready" ? { html: read.view.html } : {}),
    ...(read.view.error ? { error: read.view.error } : {}),
  });
}
