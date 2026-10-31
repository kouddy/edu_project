/**
 * POST /api/account/resolutions — record a parent's ruling on an
 * "unsure" answer: { kidId, sheetCode, questionNumber, resolution }.
 * The kid must belong to the signed-in parent.
 */

import { NextResponse } from "next/server";
import { recordResolution } from "@/lib/server/account";
import {
  bearerToken,
  parentFromToken,
  supabaseConfigured,
  supabaseForToken,
} from "@/lib/server/supabase";

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Accounts are not configured on this server." }, { status: 503 });
  }
  const token = bearerToken(req);
  const parent = await parentFromToken(token);
  const db = token ? supabaseForToken(token) : null;
  if (!parent || !db) {
    return NextResponse.json({ error: "Sign in to record a check." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const record = (body ?? {}) as {
    kidId?: unknown;
    sheetCode?: unknown;
    questionNumber?: unknown;
    resolution?: unknown;
  };
  if (
    typeof record.kidId !== "string" ||
    typeof record.sheetCode !== "string" ||
    typeof record.questionNumber !== "number" ||
    (record.resolution !== "correct" && record.resolution !== "wrong")
  ) {
    return NextResponse.json({ error: "A check needs a kid, a sheet, a question, and a ruling." }, { status: 400 });
  }
  const ok = await recordResolution(parent, db, {
    kidId: record.kidId,
    sheetCode: record.sheetCode,
    questionNumber: record.questionNumber,
    resolution: record.resolution,
  });
  if (!ok) {
    return NextResponse.json({ error: "That check doesn't match your account." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
