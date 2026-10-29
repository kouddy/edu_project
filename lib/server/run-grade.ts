/**
 * lib/server/run-grade.ts — starts a grading job and runs it to completion.
 *
 * The runner resolves everything from the file-based Pi configuration
 * (lib/server/pi-config.ts): it validates the configured prompt/context
 * files exist, picks the provider for the agent, and streams parent-language
 * step labels into the job as the provider reports them. The math agent is
 * the only active subject today (English is Phase 4); the agent is chosen
 * here, before identification, from the subjects the seeded sheets use.
 */

import type { GradeRequestPayload } from "../grade-contract";
import { createJob, updateJob, type GradeJob } from "./jobs";
import { loadPiConfig, providerDef, providerForAgent, providerKeyEnvName, validatePiConfig } from "./pi-config";
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
        const def = providerDef(config, providerId);
        const keyEnv = def ? providerKeyEnvName(def) : null;
        throw new Error(
          def
            ? `Grading provider "${providerId}" is not available — its API key is not set on the server${keyEnv ? ` (set ${keyEnv})` : ""}.`
            : `Grading provider "${providerId}" is not available — it is not defined in lib/server/pi/models.json.`,
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
