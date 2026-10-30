import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase access with the service role, which bypasses
// RLS — every query here is written against an already-verified parent.
// Configured by SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) plus
// SUPABASE_SERVICE_ROLE_KEY. When unset, account features are off and
// the app behaves exactly as it did before accounts existed.
let cached: SupabaseClient | null | undefined;

export function supabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached =
    url && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return cached;
}

export function supabaseConfigured(): boolean {
  return supabaseAdmin() !== null;
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
 * row exists (it is created on the parent's first authenticated call).
 * Returns null for a missing or invalid token.
 */
export async function parentFromToken(token: string | null): Promise<AuthedParent | null> {
  if (!token) return null;
  const admin = supabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) return null;
  const { id, email } = data.user;
  const { error: upsertError } = await admin
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
