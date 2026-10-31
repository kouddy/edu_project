import type { AccountPhotoRef, AccountState } from "../account-contract";
import type { GradeJobResult } from "../grade-contract";
import type {
  AnswerKey,
  CheckResolution,
  GradeResult,
  Kid,
  Sheet,
  Submission,
} from "../store";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOK_REGISTRY } from "./book-catalogue";
import { REGISTRY, type RegistryEntry } from "./registry";
import { bytesToPostgresHex, supabaseForToken, type AuthedParent } from "./supabase";

// The account API: everything a signed-in parent's device needs to
// mirror its server state, plus the write paths (grading persistence,
// check resolutions). Client record shapes are the store's own — the
// device seeds them into its live database unchanged.

function packetEntries(grade: number, week: number): RegistryEntry[] {
  return BOOK_REGISTRY.filter((e) => e.kidGrade === grade && e.week === week).sort((a, b) =>
    a.printedCode.localeCompare(b.printedCode),
  );
}

function sheetFromEntry(entry: RegistryEntry, kidId: string): Sheet {
  return {
    id: entry.sheetId,
    kidId,
    subject: entry.subject,
    week: entry.week,
    ...(entry.setName ? { setName: entry.setName } : {}),
    printedCode: entry.printedCode,
    topic: entry.topic,
  };
}

interface KidRow {
  id: string;
  name: string;
  grade: number;
  subject: string;
  current_week: number;
}

export async function buildAccountState(
  parent: AuthedParent,
  db: SupabaseClient,
): Promise<AccountState | null> {
  const { data: parentRow } = await db
    .from("parents")
    .select("display_name")
    .eq("id", parent.id)
    .maybeSingle();
  const { data: kidRows } = await db
    .from("kids")
    .select("id, name, grade, subject, current_week")
    .eq("parent_id", parent.id)
    .order("created_at");
  const kidsData = (kidRows ?? []) as KidRow[];
  const kids: Kid[] = kidsData.map((k) => ({
    id: k.id,
    parentId: parent.id,
    name: k.name,
    grade: k.grade,
    subject: k.subject,
  }));

  const sheets: Sheet[] = [];
  const answerKeys: AnswerKey[] = [];
  const seenSheets = new Set<string>();
  const addEntry = (entry: RegistryEntry, kidId: string) => {
    if (seenSheets.has(entry.sheetId)) return;
    seenSheets.add(entry.sheetId);
    sheets.push(sheetFromEntry(entry, kidId));
    answerKeys.push({ sheetId: entry.sheetId, questions: entry.questions });
  };
  for (const kid of kidsData) {
    for (const entry of packetEntries(kid.grade, kid.current_week)) addEntry(entry, kid.id);
  }

  const submissions: Submission[] = [];
  const gradeResults: GradeResult[] = [];
  const checkResolutions: CheckResolution[] = [];
  const photos: AccountPhotoRef[] = [];

  if (kidsData.length > 0) {
    const { data: subRows } = await db
      .from("submissions")
      .select("id, kid_id, sheet_code, created_at, graded_at")
      .in("kid_id", kidsData.map((k) => k.id))
      .order("created_at");
    const subs = subRows ?? [];
    if (subs.length > 0) {
      const subIds = subs.map((s) => s.id as string);
      const [{ data: resultRows }, { data: resolutionRows }, { data: blobRows }] =
        await Promise.all([
          db.from("grade_results").select("submission_id, per_question, graded_at").in("submission_id", subIds),
          db.from("check_resolutions").select("id, submission_id, question_number, resolution, resolved_at").in("submission_id", subIds),
          db.from("photo_blobs").select("id, submission_id, ordinal").in("submission_id", subIds).order("ordinal"),
        ]);
      const resultBySub = new Map((resultRows ?? []).map((r) => [r.submission_id as string, r]));
      const blobsBySub = new Map<string, { id: string; ordinal: number }[]>();
      for (const blob of blobRows ?? []) {
        const list = blobsBySub.get(blob.submission_id as string) ?? [];
        list.push({ id: blob.id as string, ordinal: blob.ordinal as number });
        blobsBySub.set(blob.submission_id as string, list);
      }
      for (const sub of subs) {
        // Submitted sheets can be any registered sheet, not just book
        // packets — look the code up in the full registry.
        const entry = REGISTRY.find((e) => e.printedCode === sub.sheet_code);
        if (!entry) continue;
        addEntry(entry, sub.kid_id as string);
        const subClientId = `live-sub-${sub.id}`;
        const blobs = (blobsBySub.get(sub.id as string) ?? []).sort((a, b) => a.ordinal - b.ordinal);
        submissions.push({
          id: subClientId,
          sheetId: entry.sheetId,
          photoKeys: blobs.map((b) => `live-photo-${b.id}`),
          status: "graded",
          createdAt: sub.created_at as string,
          ...(sub.graded_at ? { gradedAt: sub.graded_at as string } : {}),
        });
        for (const b of blobs) photos.push({ key: `live-photo-${b.id}`, blobId: b.id });
        const result = resultBySub.get(sub.id as string);
        if (result) {
          gradeResults.push({
            id: `live-gr-${sub.id}`,
            submissionId: subClientId,
            sheetId: entry.sheetId,
            perQuestion: result.per_question as GradeResult["perQuestion"],
            gradedAt: result.graded_at as string,
          });
        }
      }
      for (const res of resolutionRows ?? []) {
        checkResolutions.push({
          id: `live-cr-${res.id}`,
          gradeResultId: `live-gr-${res.submission_id}`,
          questionNumber: res.question_number as number,
          resolution: res.resolution as CheckResolution["resolution"],
          resolvedAt: res.resolved_at as string,
        });
      }
    }
  }

  return {
    parent: {
      id: parent.id,
      name:
        (parentRow?.display_name as string | undefined) ??
        parent.email.split("@")[0] ??
        parent.email,
    },
    kids,
    sheets,
    answerKeys,
    submissions,
    gradeResults,
    checkResolutions,
    photos,
  };
}

/**
 * Persist a finished grading job's graded sheets under the parent's
 * account: one submission per (kid, sheet), its per-question result,
 * and the photo that produced it. Called before the job is marked done,
 * so a device that pulls its account right after settling sees them.
 * Failures are logged, never fatal — the job still completes.
 */
export async function persistGradedJob(args: {
  token: string;
  kidContext: { id: string; grade: number }[];
  photos: string[];
  result: GradeJobResult;
}): Promise<void> {
  // The parent's own token: RLS confirms each kid in the context is
  // theirs before any row is written.
  const db = supabaseForToken(args.token);
  if (!db) return;
  const sheetsById = new Map(args.result.sheets.map((s) => [s.sheetId, s]));
  const photoBySheet = new Map<string, number>();
  for (const outcome of args.result.photoOutcomes) {
    if (outcome.kind === "graded" && outcome.sheetId) {
      photoBySheet.set(outcome.sheetId, outcome.photoIndex);
    }
  }
  for (const [sheetId, sheet] of sheetsById) {
    const grade = sheet.spec?.kidGrade;
    const candidates = args.kidContext.filter((k) => k.grade === grade);
    if (candidates.length !== 1) {
      console.error(
        `persist: sheet ${sheet.printedCode} matches ${candidates.length} kids of grade ${grade}; skipped`,
      );
      continue;
    }
    const kidId = candidates[0].id;
    const { data: sub, error: subError } = await db
      .from("submissions")
      .upsert(
        {
          kid_id: kidId,
          sheet_code: sheet.printedCode,
          status: "graded",
          graded_at: new Date().toISOString(),
        },
        { onConflict: "kid_id,sheet_code" },
      )
      .select("id")
      .single();
    if (subError || !sub) {
      console.error("persist submission failed:", subError?.message);
      continue;
    }
    const { error: resultError } = await db.from("grade_results").upsert(
      {
        submission_id: sub.id,
        per_question: sheet.perQuestion.map((q) => ({
          questionNumber: q.questionNumber,
          verdict: q.verdict,
          confidence: q.confidence,
          readAnswer: q.readAnswer,
          ...(q.meta ? { meta: q.meta } : {}),
        })),
        graded_at: new Date().toISOString(),
      },
      { onConflict: "submission_id" },
    );
    if (resultError) console.error("persist grade result failed:", resultError.message);

    const photoIndex = photoBySheet.get(sheetId);
    const dataUrl = photoIndex !== undefined ? args.photos[photoIndex] : undefined;
    if (dataUrl?.startsWith("data:image/")) {
      const bytes = new Uint8Array(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"));
      await db.from("photo_blobs").delete().eq("submission_id", sub.id);
      const { error: blobError } = await db.from("photo_blobs").insert({
        submission_id: sub.id,
        ordinal: 0,
        content_type: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg",
        bytes: bytesToPostgresHex(bytes),
        byte_size: bytes.length,
      });
      if (blobError) console.error("persist photo failed:", blobError.message);
    }
  }
}

export async function recordResolution(
  parent: AuthedParent,
  db: SupabaseClient,
  input: { kidId: string; sheetCode: string; questionNumber: number; resolution: "correct" | "wrong" },
): Promise<boolean> {
  const { data: kid } = await db
    .from("kids")
    .select("id")
    .eq("id", input.kidId)
    .eq("parent_id", parent.id)
    .maybeSingle();
  if (!kid) return false;
  const { data: sub } = await db
    .from("submissions")
    .select("id")
    .eq("kid_id", input.kidId)
    .eq("sheet_code", input.sheetCode)
    .maybeSingle();
  if (!sub) return false;
  const { error } = await db.from("check_resolutions").upsert(
    {
      submission_id: sub.id,
      question_number: input.questionNumber,
      resolution: input.resolution,
      resolved_at: new Date().toISOString(),
    },
    { onConflict: "submission_id,question_number" },
  );
  if (error) console.error("record resolution failed:", error.message);
  return !error;
}
