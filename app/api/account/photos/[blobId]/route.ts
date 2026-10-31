/**
 * GET /api/account/photos/:blobId — one stored sheet photo, served only
 * to the parent whose kid it belongs to. Photos live in Postgres; this
 * is the only way their bytes leave the server.
 */

import { NextResponse } from "next/server";
import {
  bearerToken,
  bytesFromPostgresHex,
  parentFromToken,
  supabaseConfigured,
  supabaseForToken,
} from "@/lib/server/supabase";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ blobId: string }> },
) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Accounts are not configured on this server." }, { status: 503 });
  }
  const token = bearerToken(req);
  const parent = await parentFromToken(token);
  const db = token ? supabaseForToken(token) : null;
  if (!parent || !db) {
    return NextResponse.json({ error: "Sign in to see photos." }, { status: 401 });
  }
  const { blobId } = await ctx.params;
  // RLS scopes photo rows to the requester's own kids, so another
  // parent's blob simply reads as absent; the owner check below is
  // kept as a second guard.
  const { data: blob } = await db
    .from("photo_blobs")
    .select("bytes, content_type, submissions!inner(kids!inner(parent_id))")
    .eq("id", blobId)
    .maybeSingle();
  const ownerId = (
    blob as unknown as { submissions?: { kids?: { parent_id?: string } } } | null
  )?.submissions?.kids?.parent_id;
  if (!blob || ownerId !== parent.id) {
    return NextResponse.json({ error: "No such photo." }, { status: 404 });
  }
  const bytes = bytesFromPostgresHex(blob.bytes as unknown as string);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": (blob.content_type as string) || "image/jpeg",
      "cache-control": "private, max-age=3600",
    },
  });
}
