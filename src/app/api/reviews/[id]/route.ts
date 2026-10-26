import { NextRequest, NextResponse } from "next/server";
import { markReviewDone } from "@/lib/store";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = (await req.json().catch(() => ({}))) as { done?: boolean };
  await markReviewDone(params.id, body.done ?? true);
  return NextResponse.json({ ok: true });
}
