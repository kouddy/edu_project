import { NextResponse } from "next/server";
import { loadReviews } from "@/lib/store";

export async function GET() {
  const reviews = await loadReviews();
  const now = new Date().toISOString();
  const due = reviews.filter((r) => !r.done && r.dueAt <= now);
  const upcoming = reviews.filter((r) => !r.done && r.dueAt > now);
  return NextResponse.json({ due, upcoming });
}
