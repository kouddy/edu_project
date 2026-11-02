/**
 * GET /api/guidance-poster/:printedCode/:question — the concept
 * poster for the question's topic. The first poll queues the
 * poster's generation (one poster per topic, cached on the
 * server); the client keeps polling while the status is
 * generating and shows the image, with a download, when it is
 * ready. A poster that fails its vision check never reports
 * ready.
 *
 * Without a token the caller is a demo client. With a token the
 * caller is a live parent, and the image is served only when the
 * parent's account has a submission for the sheet — the same rule
 * as the guidance animation.
 */

import { NextResponse } from "next/server";
import { getPoster } from "@/lib/server/guidance-poster";
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
  const read = await getPoster(printedCode, questionNumber, auth);
  if (read.kind === "unknown") {
    return NextResponse.json({ error: "No such question." }, { status: 404 });
  }
  if (read.kind === "forbidden") {
    return NextResponse.json({ error: "That sheet is not on this account." }, { status: 403 });
  }
  return NextResponse.json({
    status: read.view.status,
    ...(read.view.status === "ready" ? { image: read.view.image } : {}),
    ...(read.view.error ? { error: read.view.error } : {}),
  });
}
