import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase access for live accounts. All data access runs
// under the signed-in parent's own token, so row-level security is the
// boundary for every query — the policies scope each table to the
// parent's own family. Nothing here depends on a service-role key
// bypassing RLS: how a stack maps its secret key to a database role
// varies, while a user token always lands on the authenticated role
// the policies are written for. Configured by SUPABASE_URL (or
// NEXT_PUBLIC_SUPABASE_URL) plus NEXT_PUBLIC_SUPABASE_ANON_KEY (the
// publishable key). When unset, account features are off and the app
// behaves exactly as it did before accounts existed.

function supabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function publishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && publishableKey());
}

/** A client carrying the parent's bearer token: every query it makes
 *  is RLS-scoped to that parent. */
export function supabaseForToken(token: string): SupabaseClient | null {
  const url = supabaseUrl();
  const key = publishableKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export interface AuthedParent {
  id: string;
  email: string;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

/**
 * Verify a bearer token with the Auth server and make sure the parent
 * row exists (it is created on the parent's first authenticated call,
 * as the parent themselves — the parents policy allows a signed-in
 * parent to write their own row). Returns null for a missing or
 * invalid token.
 */
export async function parentFromToken(token: string | null): Promise<AuthedParent | null> {
  if (!token) return null;
  const db = supabaseForToken(token);
  if (!db) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const { id, email } = data.user;
  const { error: upsertError } = await db
    .from("parents")
    .upsert({ id, email }, { onConflict: "id" });
  if (upsertError) {
    console.error("parents upsert failed:", upsertError.message);
    return null;
  }
  return { id, email };
}

/** PostgREST returns bytea as a "\x<hex>" string; inserts accept the same form. */
export function bytesToPostgresHex(bytes: Uint8Array): string {
  return "\\x" + Buffer.from(bytes).toString("hex");
}

export function bytesFromPostgresHex(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  return new Uint8Array(Buffer.from(hex, "hex"));
}
