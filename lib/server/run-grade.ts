/**
 * lib/server/run-grade.ts — starts a grading job and runs it to completion.
 *
 * The runner resolves everything from the file-based Pi configuration
 * (lib/server/pi-config.ts): it validates the configured prompt/context
 * files exist and picks the provider for the agent. The math agent is the
 * only active subject today (English is Phase 4); the agent is chosen
 * here, before identification, from the subjects the seeded sheets use.
 *
 * Stage 3.5 (docs/stage-3.5-design.md): photos are processed sequentially,
 * one provider call per attempt. Failed/read-rejected photos retry inside
 * the job (up to 3 attempts total; a deterministic rejection that repeats
 * with the same reason stops early; graded results and successes are
 * never re-run). A photo that identifies to a sheet already graded in
 * this job short-circuits to a `duplicate` outcome, and every photo ends
 * with its own outcome — the job completes with partial success rather
 * than failing wholesale on the first bad photo.
 */

import type {
  ApiSheetResult,
  GradeJobResult,
  GradeRequestPayload,
  PhotoOutcome,
} from "../grade-contract";
import { createJob, updateJob, updatePhotoProgress, type GradeJob } from "./jobs";
import { loadPiConfig, providerDef, providerForAgent, providerKeyEnvName, validatePiConfig } from "./pi-config";
import { resolveProvider, type GradingProvider, type PhotoAttempt } from "./providers";

const MAX_ATTEMPTS = 3;

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
  const photoOutcomes: PhotoOutcome[] = [];
  const gradedSheetIds = new Set<string>();
  const seenPayloads = new Map<string, string>(); // photo payload → sheetId
  const allSteps: string[] = [];
  const allNotes: string[] = [];

  async function runPhotoWithAttempts(
    jobIdInner: string,
    providerInner: GradingProvider,
    payloadInner: GradeRequestPayload,
    index: number,
    photo: string,
    gradedInner: Set<string>,
    stepsSink: string[],
    notesSink: string[],
  ): Promise<PhotoOutcome> {
    let lastReason: string | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: PhotoAttempt;
      try {
        res = await providerInner.runPhoto({
          photo,
          photoIndex: index,
          kidContext: payloadInner.kidContext,
          onStep: (step) => {
            if (!stepsSink.includes(step)) stepsSink.push(step);
            updateJob(jobIdInner, { step });
            updatePhotoProgress(jobIdInner, index, { step });
          },
          onIdentified: (info) => {
            updatePhotoProgress(jobIdInner, index, { sheetLabel: info.sheetLabel });
          },
          shouldStopAfterIdentify: (sheetId) => gradedInner.has(sheetId),
        });
      } catch (err) {
        res = {
          kind: "failed",
          reason: err instanceof Error ? err.message : "Grading failed.",
          steps: [],
          notes: [],
        };
      }
      for (const s of res.steps) if (!stepsSink.includes(s)) stepsSink.push(s);
      notesSink.push(...res.notes);

      if (res.kind === "graded" && res.sheet) {
        sheets.push(res.sheet);
        updatePhotoProgress(jobIdInner, index, { state: "marked" });
        return { photoIndex: index, kind: "graded", sheetId: res.sheet.sheetId, attempts: attempt };
      }
      if (res.kind === "duplicate") {
        return { photoIndex: index, kind: "duplicate", sheetId: res.identified?.sheetId, attempts: attempt };
      }
      if (res.kind === "rejected-deterministic") {
        // Same deterministic reason twice in a row cannot change on a
        // third look at the identical photo — stop early (Stage 3.5 §3).
        if (attempt >= 2 && res.reason === lastReason) {
          return { photoIndex: index, kind: "rejected-deterministic", reason: res.reason, attempts: attempt };
        }
        lastReason = res.reason;
        if (attempt === MAX_ATTEMPTS) {
          return { photoIndex: index, kind: "rejected-deterministic", reason: res.reason, attempts: attempt };
        }
        continue;
      }
      // rejected-read / failed: use the remaining attempts.
      lastReason = res.reason;
      if (attempt === MAX_ATTEMPTS) {
        return { photoIndex: index, kind: res.kind, reason: res.reason, attempts: attempt };
      }
    }
    return { photoIndex: index, kind: "failed", reason: lastReason, attempts: MAX_ATTEMPTS };
  }

  for (const [index, photo] of payload.photos.entries()) {
    // Byte-identical photos in one batch are the same sheet photographed
    // twice — never spend a grading call on the copy (Stage 3.5 §4).
    const earlierSheetId = seenPayloads.get(photo);
    if (earlierSheetId) {
      photoOutcomes.push({ photoIndex: index, kind: "duplicate", sheetId: earlierSheetId, attempts: 0 });
      updatePhotoProgress(jobId, index, { state: "settled" });
      continue;
    }

    const outcome = await runPhotoWithAttempts(jobId, provider, payload, index, photo, gradedSheetIds, allSteps, allNotes);
    photoOutcomes.push(outcome);
    if (outcome.kind === "graded" && outcome.sheetId) {
      gradedSheetIds.add(outcome.sheetId);
      seenPayloads.set(photo, outcome.sheetId);
    }
    updatePhotoProgress(jobId, index, { state: "settled" });
  }

  return {
    outcome: "completed",
    sheets,
    photoOutcomes,
    trace: {
      provider: provider.id,
      model: provider.model,
      steps: allSteps,
      ...(allNotes.length > 0 ? { note: allNotes.join(" ") } : {}),
    },
  };
}
