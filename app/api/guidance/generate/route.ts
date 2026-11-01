/**
 * POST /api/guidance/generate — queue guidance generation for one
 * question on demand (pre-generation, regeneration, tests). Body:
 * { printedCode, questionNumber, html? }. A supplied `html` skips
 * generation and goes straight to verification, which is how
 * pre-generated artefacts enter the same gate as generated ones.
 */

import { NextResponse } from "next/server";
import { enqueueGuidance } from "@/lib/server/guidance";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    printedCode?: string;
    questionNumber?: number;
    html?: string;
  } | null;
  if (!body?.printedCode || typeof body.questionNumber !== "number") {
    return NextResponse.json(
      { error: "printedCode and questionNumber are required." },
      { status: 400 },
    );
  }
  const record = enqueueGuidance(body.printedCode, body.questionNumber, {
    html: body.html,
    force: true,
  });
  if (!record) {
    return NextResponse.json({ error: "No such question." }, { status: 404 });
  }
  return NextResponse.json({ key: record.key, status: record.status });
}
