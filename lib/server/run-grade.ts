/**
 * lib/server/run-grade.ts — starts a grading job and runs it to completion.
 *
 * The runner resolves everything from the file-based Pi configuration
 * (lib/server/pi-config.ts): it validates the configured prompt/context
 * files exist and picks the provider for the agent. The math agent is the
 * only active subject today (English is not active yet); the agent is chosen
 * here, before identification, from the subjects the seeded sheets use.
 *
 * Photos are processed in parallel, up to GRADE_CONCURRENCY at a time,
 * one provider call per attempt. Failed/read-rejected photos retry inside
 * the job (up to 3 attempts total; deterministic rejections are
 * terminal on first occurrence; graded results and successes are
 * never re-run). A photo that identifies to a sheet already graded in
 * this job short-circuits to a `duplicate` outcome; one that identifies
 * to a sheet another photo is still grading is parked and settled once
 * that photo finishes — duplicate if it graded, its own grading turn
 * if it did not. Every photo ends
 * with its own outcome — the job completes with partial success rather
 * than failing wholesale on the first bad photo.
 */

import type {
  ApiSheetResult,
  ApiSheetSpec,
  GradeJobResult,
  GradeRequestPayload,
  PhotoOutcome,
} from "../grade-contract";
import { createJob, updateJob, updatePhotoProgress, type GradeJob } from "./jobs";
import { persistGradedJob } from "./account";
import { findBySheetId } from "./registry";
import { loadPiConfig, providerDef, providerForAgent, providerKeyEnvName, validatePiConfig } from "./pi-config";
import { resolveProvider, type GradingProvider, type PhotoAttempt } from "./providers";

const MAX_ATTEMPTS = 3;

/** How many photos grade at once. Each photo is a multi-call provider
 *  session, so the cap keeps a big batch from flooding the provider —
 *  a finished photo frees its slot immediately (no fixed batches). */
const GRADE_CONCURRENCY = 3;

export function startGradeJob(payload: GradeRequestPayload): GradeJob {
  const job = createJob(payload.photos.length);

  void (async () => {
    try {
      const config = loadPiConfig();
      const missing = validatePiConfig(config);
      if (missing.length > 0) {
        throw new Error(`Pi configuration is incomplete — missing files: ${missing.join(", ")}`);
      }
      const providerId = providerForAgent(config, "math");
      const provider = resolveProvider(providerId);
      if (!provider) {
        const def = providerDef(config, providerId);
        const keyEnv = def ? providerKeyEnvName(def) : null;
        throw new Error(
          def
            ? `Grading provider "${providerId}" is not available — its API key is not set on the server${keyEnv ? ` (set ${keyEnv})` : ""}.`
            : `Grading provider "${providerId}" is not available — it is not defined in lib/server/pi/models.json.`,
        );
      }
      const result = await runBatch(job.id, provider, payload);
      if (payload.accountParentId && payload.accountToken) {
        // Persist before the job reads as done, so a device that pulls
        // its account the moment grading settles already sees the
        // results. A persistence failure must not fail the grading.
        try {
          await persistGradedJob({
            token: payload.accountToken,
            kidContext: payload.kidContext,
            photos: payload.photos,
            result,
          });
        } catch (err) {
          console.error("persist graded job failed:", err instanceof Error ? err.message : err);
        }
      }
      updateJob(job.id, { status: "done", step: "Done", result });
    } catch (err) {
      updateJob(job.id, {
        status: "failed",
        step: "Something went wrong",
        error: err instanceof Error ? err.message : "Unknown grading error",
      });
    }
  })();

  return job;
}

async function runBatch(
  jobId: string,
  provider: GradingProvider,
  payload: GradeRequestPayload,
): Promise<GradeJobResult> {
  const sheets: ApiSheetResult[] = [];
  const outcomes: PhotoOutcome[] = new Array(payload.photos.length);
  const gradedSheetIds = new Set<string>();
  // sheetId → the photo index grading it right now. Identification is
  // where a duplicate is decided, so the claim is taken there: a second
  // photo of the same sheet stops right after identifying instead of
  // grading in parallel and racing the first photo's result.
  const sheetClaims = new Map<string, number>();
  const allSteps: string[] = [];
  const allNotes: string[] = [];

  // A photo whose duplicate verdict came from a live claim rather than
  // a finished grade is parked here and settled after the pool drains:
  // if the claiming photo failed to grade, this photo gets its own turn
  // (the sequential behaviour), instead of losing its sheet to a claim
  // that never produced a result.
  const deferred: { index: number; sheetId: string; attempts: number }[] = [];

  async function runPhotoWithAttempts(
    index: number,
    photo: string,
  ): Promise<{ outcome: PhotoOutcome; blockedBySheetId?: string }> {
    const myClaims = new Set<string>();
    const releaseClaims = () => {
      for (const sheetId of myClaims) {
        if (sheetClaims.get(sheetId) === index) sheetClaims.delete(sheetId);
      }
      myClaims.clear();
    };
    let lastReason: string | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let blockedBy: string | undefined;
      let res: PhotoAttempt;
      try {
        res = await provider.runPhoto({
          photo,
          photoIndex: index,
          tag: `${jobId.slice(0, 12)} photo ${index + 1} attempt ${attempt}`,
          kidContext: payload.kidContext,
          onStep: (step) => {
            if (!allSteps.includes(step)) allSteps.push(step);
            updateJob(jobId, { step });
            updatePhotoProgress(jobId, index, { step });
          },
          onIdentified: (info) => {
            updatePhotoProgress(jobId, index, { sheetLabel: info.sheetLabel });
          },
          shouldStopAfterIdentify: (sheetId) => {
            if (gradedSheetIds.has(sheetId)) return true;
            const owner = sheetClaims.get(sheetId);
            if (owner === undefined) {
              sheetClaims.set(sheetId, index);
              myClaims.add(sheetId);
              return false;
            }
            if (owner !== index) blockedBy = sheetId;
            return owner !== index;
          },
        });
      } catch (err) {
        res = {
          kind: "failed",
          reason: err instanceof Error ? err.message : "Grading failed.",
          steps: [],
          notes: [],
        };
      }
      for (const s of res.steps) if (!allSteps.includes(s)) allSteps.push(s);
      allNotes.push(...res.notes);

      if (res.kind === "graded" && res.sheet) {
        // Attach the catalogue entry so a device with no local record
        // for this sheet can still file the result (guest accounts
        // scanning from scratch have no seeded sheets at all).
        const entry = findBySheetId(res.sheet.sheetId);
        if (entry && !res.sheet.spec) {
          const spec: ApiSheetSpec = {
            kidGrade: entry.kidGrade,
            subject: entry.subject,
            week: entry.week,
            ...(entry.setName ? { setName: entry.setName } : {}),
            topic: entry.topic,
            questions: entry.questions,
          };
          res.sheet.spec = spec;
        }
        sheets.push(res.sheet);
        updatePhotoProgress(jobId, index, { state: "marked" });
        return { outcome: { photoIndex: index, kind: "graded", sheetId: res.sheet.sheetId, attempts: attempt } };
      }
      if (res.kind === "duplicate") {
        releaseClaims();
        return {
          outcome: { photoIndex: index, kind: "duplicate", sheetId: res.identified?.sheetId, attempts: attempt },
          ...(blockedBy ? { blockedBySheetId: blockedBy } : {}),
        };
      }
      if (res.kind === "rejected-deterministic") {
        // Terminal on first occurrence. The identification step already
        // re-reads the code inside the session before declaring it
        // unknown — that second look is the safeguard. A cross-attempt
        // retry adds nothing and risks the model force-fitting a similar
        // code to a real sheet — e.g. "correcting" a sheet printed
        // G9-MATH-W99-Z to G4-MATH-W12-A and grading it against the
        // wrong key.
        releaseClaims();
        return { outcome: { photoIndex: index, kind: "rejected-deterministic", reason: res.reason, attempts: attempt } };
      }
      // rejected-read / failed: use the remaining attempts.
      lastReason = res.reason;
      if (attempt === MAX_ATTEMPTS) {
        releaseClaims();
        return { outcome: { photoIndex: index, kind: res.kind, reason: res.reason, attempts: attempt } };
      }
    }
    releaseClaims();
    return { outcome: { photoIndex: index, kind: "failed", reason: lastReason, attempts: MAX_ATTEMPTS } };
  }

  // Byte-identical photos in one batch are the same sheet photographed
  // twice — never spend a grading call on the copy. Copies form a chain
  // behind their original: a copy short-circuits to `duplicate` once any
  // earlier member of the chain has graded; if the earlier members all
  // fail, the copy gets its own chance, exactly as in sequence.
  const chains = new Map<string, number[]>();
  payload.photos.forEach((photo, index) => {
    const chain = chains.get(photo);
    if (chain) chain.push(index);
    else chains.set(photo, [index]);
  });

  async function runChain(indices: number[]): Promise<void> {
    let chainSheetId: string | undefined;
    for (const index of indices) {
      if (chainSheetId) {
        outcomes[index] = { photoIndex: index, kind: "duplicate", sheetId: chainSheetId, attempts: 0 };
        updatePhotoProgress(jobId, index, { state: "settled" });
        continue;
      }
      const { outcome, blockedBySheetId } = await runPhotoWithAttempts(index, payload.photos[index]);
      if (blockedBySheetId && outcome.kind === "duplicate") {
        // Parked, not settled: the sheet was still being graded by
        // another photo. Settled after the pool drains, below.
        deferred.push({ index, sheetId: blockedBySheetId, attempts: outcome.attempts });
        continue;
      }
      outcomes[index] = outcome;
      if (outcome.kind === "graded" && outcome.sheetId) {
        gradedSheetIds.add(outcome.sheetId);
        chainSheetId = outcome.sheetId;
      }
      updatePhotoProgress(jobId, index, { state: "settled" });
    }
  }

  const chainList = [...chains.values()];
  let nextChain = 0;
  async function worker(): Promise<void> {
    while (nextChain < chainList.length) {
      const chain = chainList[nextChain++];
      await runChain(chain);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(GRADE_CONCURRENCY, chainList.length) }, () => worker()),
  );

  // Settle parked photos now that every claim has resolved: duplicate
  // if their sheet did get graded, a fresh grading turn if it did not.
  for (const parked of deferred) {
    if (gradedSheetIds.has(parked.sheetId)) {
      outcomes[parked.index] = {
        photoIndex: parked.index,
        kind: "duplicate",
        sheetId: parked.sheetId,
        attempts: parked.attempts,
      };
    } else {
      const { outcome } = await runPhotoWithAttempts(parked.index, payload.photos[parked.index]);
      outcomes[parked.index] = outcome;
      if (outcome.kind === "graded" && outcome.sheetId) gradedSheetIds.add(outcome.sheetId);
    }
    updatePhotoProgress(jobId, parked.index, { state: "settled" });
  }

  // Results come back in photo order regardless of finishing order.
  const photoOrder = new Map(outcomes.map((o) => [o.sheetId, o.photoIndex]));
  sheets.sort((a, b) => (photoOrder.get(a.sheetId) ?? 0) - (photoOrder.get(b.sheetId) ?? 0));

  return {
    outcome: "completed",
    sheets,
    photoOutcomes: outcomes,
    trace: {
      provider: provider.id,
      model: provider.model,
      steps: allSteps,
      ...(allNotes.length > 0 ? { note: allNotes.join(" ") } : {}),
    },
  };
}
