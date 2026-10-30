/**
 * GET /api/account — the signed-in parent's full server state, in the
 * client's own record shapes: kids, their current packets, every
 * submission with its result and resolutions, and photo references.
 * Requires a Supabase bearer token; 401 without one.
 */

import { NextResponse } from "next/server";
import { buildAccountState } from "@/lib/server/account";
import { bearerToken, parentFromToken, supabaseConfigured } from "@/lib/server/supabase";

export async function GET(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Accounts are not configured on this server." }, { status: 503 });
  }
  const parent = await parentFromToken(bearerToken(req));
  if (!parent) {
    return NextResponse.json({ error: "Sign in to see your account." }, { status: 401 });
  }
  const state = await buildAccountState(parent);
  if (!state) {
    return NextResponse.json({ error: "Account is unavailable just now." }, { status: 503 });
  }
  return NextResponse.json(state);
}
