import type { SupabaseClient } from "@supabase/supabase-js";
import { FINALS_WEEK } from "./book-catalogue";

// Operator actions on enrollments. Advancing a week is how a kid gets
// their next packet: it happens when the hub hands the packet out, and
// it is deliberately not something the app does on its own (a calendar
// or a finished packet cannot know whether the family holds the paper)
// and not something a parent can do from their account.

export type AdvanceWeekResult =
  | { ok: true; currentWeek: number }
  | { ok: false; reason: "not-found" | "at-final-week" | "conflict" | "error"; message?: string };

/** Move one enrollment (a kid's subject track) to its next week. */
export async function advanceWeek(
  db: SupabaseClient,
  kidId: string,
  subject: string,
): Promise<AdvanceWeekResult> {
  const { data: row, error } = await db
    .from("enrollments")
    .select("id, current_week")
    .eq("kid_id", kidId)
    .eq("subject", subject)
    .maybeSingle();
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!row) return { ok: false, reason: "not-found" };
  const current = row.current_week as number;
  if (current >= FINALS_WEEK) return { ok: false, reason: "at-final-week" };
  // The current_week guard makes two calls racing each other safe:
  // only the first one's update matches the row it read.
  const { data: updated, error: updateError } = await db
    .from("enrollments")
    .update({ current_week: current + 1 })
    .eq("id", row.id)
    .eq("current_week", current)
    .select("current_week")
    .maybeSingle();
  if (updateError) return { ok: false, reason: "error", message: updateError.message };
  if (!updated) return { ok: false, reason: "conflict" };
  return { ok: true, currentWeek: updated.current_week as number };
}
