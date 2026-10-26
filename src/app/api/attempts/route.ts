import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { getSheet, newId, saveAttempt, addReviews, uploadDir } from "@/lib/store";
import { gradePhoto } from "@/lib/grade";
import { REVIEW_OFFSETS_DAYS, type ReviewItem } from "@/lib/types";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sheetId = String(form.get("sheetId") ?? "");
  const photo = form.get("photo");

  if (!sheetId) {
    return NextResponse.json({ error: "Missing sheetId" }, { status: 400 });
  }
  const sheet = await getSheet(sheetId);
  if (!sheet) {
    return NextResponse.json({ error: "Unknown sheet" }, { status: 404 });
  }
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: "Missing photo file" }, { status: 400 });
  }
  if (photo.type && !ALLOWED.has(photo.type)) {
    return NextResponse.json(
      { error: "Please upload a JPG, PNG, or WebP photo." },
      { status: 400 }
    );
  }
  const bytes = Buffer.from(await photo.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo must be non-empty and under 10 MB." },
      { status: 400 }
    );
  }

  const ext =
    photo.type === "image/png" ? ".png" : photo.type === "image/webp" ? ".webp" : ".jpg";
  const attemptId = newId("att");
  const fileName = `${attemptId}${ext}`;
  await fs.mkdir(uploadDir(), { recursive: true });
  await fs.writeFile(path.join(uploadDir(), fileName), bytes);

  let result;
  try {
    result = await gradePhoto(sheet, bytes, photo.type || "image/jpeg");
  } catch (err) {
    console.error(
      "Grading failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Grading failed. Please try again." },
      { status: 502 }
    );
  }

  const attempt = {
    id: attemptId,
    sheetId,
    photoFile: fileName,
    createdAt: new Date().toISOString(),
    rejectionReason: result.rejectionReason,
    items: result.items,
  };
  await saveAttempt(attempt);

  if (!result.rejectionReason) {
    const now = Date.now();
    const reviews: ReviewItem[] = result.items
      .filter((i) => i.status === "wrong")
      .flatMap((i) =>
        REVIEW_OFFSETS_DAYS.map((d, n) => ({
          id: newId("rev"),
          sheetId,
          qid: i.qid,
          attemptId,
          dueAt: new Date(now + d * 24 * 3600 * 1000).toISOString(),
          done: false,
          createdAt: new Date().toISOString(),
        }))
      );
    if (reviews.length > 0) await addReviews(reviews);
  }

  return NextResponse.json({ attempt });
}
