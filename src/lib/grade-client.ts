// Client-side driver for the grading pipeline.
//
// The vision call itself runs in POST /api/grade (API key stays server-side).
// This helper fetches the submission's photo from IndexedDB, posts it with
// the sheet code, and persists the outcome through the Store: GradedResult +
// status "graded", or status "rejected"/"failed" with a parent-visible note.

import { store } from "./browser-store";
import type {
  GradedQuestionResult,
  Submission,
  SubmissionStatus,
} from "./product-types";

export interface GradeAttempt {
  status: SubmissionStatus;
  /** Parent-visible note for rejected/failed outcomes. */
  message?: string;
  demo?: boolean;
}

const FALLBACK_MESSAGE =
  "Grading didn't work this time. Please check your connection and try again.";

async function failSubmission(
  submission: Submission,
  message: string
): Promise<GradeAttempt> {
  await store.saveSubmission({
    ...submission,
    status: "failed",
    message,
  });
  return { status: "failed", message };
}

export async function gradeSubmission(submissionId: string): Promise<GradeAttempt> {
  const submission = await store.getSubmission(submissionId);
  if (!submission) throw new Error(`Unknown submission: ${submissionId}`);

  const photo = await store.getPhoto(submission.photoId);
  if (!photo) {
    return failSubmission(submission, "The photo for this upload is missing from this device.");
  }

  const form = new FormData();
  form.append("photo", photo, "worksheet.jpg");
  form.append("sheetCode", submission.sheetCode);
  form.append("submissionId", submission.id);

  let data: {
    ok?: boolean;
    status?: string;
    result?: {
      submissionId: string;
      perQuestion: GradedQuestionResult[];
      score: number;
      gradedAt: string;
    };
    reason?: string;
    error?: string;
    demo?: boolean;
  };
  try {
    const res = await fetch("/api/grade", { method: "POST", body: form });
    data = (await res.json()) as typeof data;
    if (!res.ok || !data.ok) {
      return failSubmission(
        submission,
        typeof data?.error === "string" && data.error
          ? data.error
          : FALLBACK_MESSAGE
      );
    }
  } catch {
    // Network failure talking to /api/grade (the route retries model errors
    // itself before responding).
    return failSubmission(submission, FALLBACK_MESSAGE);
  }

  if (data.status === "rejected") {
    const message =
      typeof data.reason === "string" && data.reason
        ? data.reason
        : "This photo couldn't be graded. Please retake it showing the full worksheet.";
    await store.saveSubmission({ ...submission, status: "rejected", message });
    return { status: "rejected", message, demo: data.demo };
  }

  if (data.status === "graded" && data.result) {
    await store.saveGradedResult({
      submissionId: submission.id,
      perQuestion: data.result.perQuestion,
      score: data.result.score,
      gradedAt: data.result.gradedAt,
    });
    const { message: _dropped, ...rest } = submission;
    await store.saveSubmission({ ...rest, status: "graded" });
    return { status: "graded", demo: data.demo };
  }

  return failSubmission(submission, FALLBACK_MESSAGE);
}
