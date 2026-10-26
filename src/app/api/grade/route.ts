import { NextRequest, NextResponse } from "next/server";
import { getSheet } from "@/lib/store";
import {
  GRADING_FAILED_MESSAGE,
  gradeProductPhoto,
} from "@/lib/product-grade";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Grade a worksheet photo against a sheet's answer key.
 *
 * The vision API key stays server-side: the client POSTs multipart form data
 * (photo, sheetCode, submissionId?) and gets back a grading outcome, which it
 * then persists through the browser Store (GradedResult + submission status)
 * — records live in browser localStorage, out of the server's reach.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sheetCode = String(form.get("sheetCode") ?? "");
  const submissionId = String(form.get("submissionId") ?? "");
  const photo = form.get("photo");

  if (!sheetCode) {
    return NextResponse.json(
      { ok: false, error: "Missing sheet code." },
      { status: 400 }
    );
  }
  const sheet = await getSheet(sheetCode);
  if (!sheet) {
    return NextResponse.json(
      {
        ok: false,
        error: `I couldn't find the answer key for "${sheetCode}". Please check the sheet code and try again.`,
      },
      { status: 404 }
    );
  }
  if (!(photo instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Missing photo file." },
      { status: 400 }
    );
  }
  if (photo.type && !ALLOWED.has(photo.type)) {
    return NextResponse.json(
      { ok: false, error: "Please upload a JPG, PNG, or WebP photo." },
      { status: 400 }
    );
  }
  const bytes = Buffer.from(await photo.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Photo must be non-empty and under 10 MB." },
      { status: 400 }
    );
  }

  let call;
  try {
    call = await gradeProductPhoto(sheet, bytes, photo.type || "image/jpeg");
  } catch (err) {
    console.error(
      "Grading failed after retry:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { ok: false, error: GRADING_FAILED_MESSAGE },
      { status: 502 }
    );
  }

  if (call.outcome.rejected) {
    return NextResponse.json({
      ok: true,
      submissionId,
      status: "rejected",
      reason: call.outcome.reason,
      demo: call.demo,
    });
  }
  return NextResponse.json({
    ok: true,
    submissionId,
    status: "graded",
    result: {
      submissionId,
      perQuestion: call.outcome.perQuestion,
      score: call.outcome.score,
      gradedAt: new Date().toISOString(),
    },
    demo: call.demo,
  });
}
