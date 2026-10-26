import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { uploadDir } from "@/lib/store";
import { verifyPhotoSignature } from "@/lib/sign";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { file: string } }
) {
  const file = decodeURIComponent(params.file);
  const url = new URL(_req.url);
  const ok = verifyPhotoSignature(
    file,
    url.searchParams.get("exp"),
    url.searchParams.get("sig")
  );
  if (!ok) {
    return NextResponse.json({ error: "Photo link expired." }, { status: 403 });
  }
  if (file.includes("/") || file.includes("\\") || file.startsWith(".")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const bytes = await fs.readFile(path.join(uploadDir(), file));
    const ext = path.extname(file).toLowerCase();
    return new NextResponse(bytes, {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
