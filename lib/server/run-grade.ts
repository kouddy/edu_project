/**
 * lib/server/run-grade.ts — starts a grading job and runs it to completion.
 *
 * The runner resolves everything from the file-based Pi configuration
 * (lib/server/pi-config.ts): it validates the configured prompt/context
 * files exist, picks the provider for the agent, and streams parent-language
 * step labels into the job as the provider reports them. Phase 1 runs the
 * math agent only; the subject is chosen from the identified sheet once the
 * real harness (Phase 2) performs identification.
 */

import type { GradeRequestPayload } from "../grade-contract";
import { createJob, updateJob, type GradeJob } from "./jobs";
import { loadPiConfig, providerForAgent, validatePiConfig } from "./pi-config";
import { resolveProvider } from "./providers";

export function startGradeJob(payload: GradeRequestPayload): GradeJob {
  const job = createJob();

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
        throw new Error(
          `Grading provider "${providerId}" is not available — it is not registered, or its API key is not set on the server (for "meta", set META_API_KEY).`,
        );
      }
      const result = await provider.run({
        photos: payload.photos,
        kidContext: payload.kidContext,
        onStep: (step) => updateJob(job.id, { step }),
      });
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
