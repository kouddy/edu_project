/**
 * GET /api/guidance/:printedCode/:question — the guidance artefact
 * for one question. The first poll for a question with no artefact
 * queues its generation (so sheets graded before guidance existed
 * are covered too); the client keeps polling while the status is
 * generating/verifying and swaps the animation in when it is ready.
 */

import { NextResponse } from "next/server";
import { enqueueGuidance, getGuidance } from "@/lib/server/guidance";
import { findByPrintedCode } from "@/lib/server/registry";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ printedCode: string; question: string }> },
) {
  const { printedCode, question } = await ctx.params;
  const questionNumber = Number(question);
  const entry = findByPrintedCode(printedCode);
  if (!entry || !entry.questions.some((q) => q.number === questionNumber)) {
    return NextResponse.json({ error: "No such question." }, { status: 404 });
  }
  const record = getGuidance(printedCode, questionNumber) ?? enqueueGuidance(printedCode, questionNumber);
  if (!record) {
    return NextResponse.json({ error: "No such question." }, { status: 404 });
  }
  return NextResponse.json({
    status: record.status,
    ...(record.status === "ready" ? { html: record.html } : {}),
    ...(record.error ? { error: record.error } : {}),
  });
}
