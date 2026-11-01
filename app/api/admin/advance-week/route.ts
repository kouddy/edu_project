/**
 * POST /api/admin/advance-week — move one kid's subject track to its
 * next week: { kidId, subject } in, the new current week out.
 *
 * An operator endpoint, called by the hub (with curl, say) when a
 * packet is handed out. It is off unless the server has both an
 * ADMIN_API_KEY (sent as the x-admin-key header) and a
 * SUPABASE_SERVICE_ROLE_KEY: parents have no write access to
 * enrollments, so no parent token can do this.
 */

import { NextResponse } from "next/server";
import { advanceWeek } from "@/lib/server/admin";
import { supabaseAdmin } from "@/lib/server/supabase";

export async function POST(req: Request) {
  const adminKey = process.env.ADMIN_API_KEY;
  const db = supabaseAdmin();
  if (!adminKey || !db) {
    return NextResponse.json(
      { error: "The admin API is not configured on this server." },
      { status: 503 },
    );
  }
  if (req.headers.get("x-admin-key") !== adminKey) {
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body: { kidId, subject }." }, { status: 400 });
  }
  const { kidId, subject } = (body ?? {}) as { kidId?: unknown; subject?: unknown };
  if (
    typeof kidId !== "string" ||
    kidId.length === 0 ||
    typeof subject !== "string" ||
    subject.length === 0
  ) {
    return NextResponse.json({ error: "Send a JSON body: { kidId, subject }." }, { status: 400 });
  }
  const result = await advanceWeek(db, kidId, subject);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json(
        { error: `No ${subject} enrollment for that kid.` },
        { status: 404 },
      );
    }
    if (result.reason === "at-final-week") {
      return NextResponse.json(
        { error: "That track is already on the finals week, its last week." },
        { status: 409 },
      );
    }
    if (result.reason === "conflict") {
      return NextResponse.json(
        { error: "That track was just advanced by another call; retry to advance again." },
        { status: 409 },
      );
    }
    console.error("advance-week failed:", result.message);
    return NextResponse.json({ error: "Advancing the week failed." }, { status: 500 });
  }
  return NextResponse.json({ kidId, subject, currentWeek: result.currentWeek });
}
