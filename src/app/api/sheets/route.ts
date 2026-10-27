import { NextResponse } from "next/server";
import { loadSheets } from "@/lib/store";

/**
 * Read-only sheet catalog for browsers. The server owns the sheets (see
 * lib/store.ts); clients sync from here so every visible sheet is gradable.
 * Answer keys are already visible to parents in the app, so listing them
 * here exposes nothing new.
 */
export async function GET() {
  const sheets = await loadSheets();
  return NextResponse.json({ sheets });
}
