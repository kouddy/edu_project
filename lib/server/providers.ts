/**
 * lib/server/providers.ts — grading providers behind one per-photo
 * interface (the job runner in lib/server/run-grade.ts owns
 * attempts, dedupe, and aggregation; a provider grades ONE photo per call).
 *
 * Providers are defined in lib/server/pi/models.json (Pi's native
 * provider/model format) and all run through the one Pi harness —
 * adding a provider is a file edit. There is no scripted or fallback
 * provider: a provider resolves only when its API key is set on the
 * server (or it is keyless by design), so a keyless deployment fails
 * honestly with the runner's "provider not available" error instead
 * of silently grading with something else.
 */

import type { ApiSheetResult, GradeRequestPayload, PhotoOutcomeKind } from "../grade-contract";
import {
  effectiveModel,
  loadPiConfig,
  providerDef,
  providerKeyAvailable,
  resolveProviderApiKey,
} from "./pi-config";
import type { IdentifiedSheet } from "./pi-harness";

/** One photo's grading attempt, as reported to the job runner. */
export interface PhotoAttempt {
  kind: PhotoOutcomeKind;
  sheet?: ApiSheetResult;
  identified?: IdentifiedSheet;
  reason?: string;
  steps: string[];
  /** Trace note fragments (confidence coercions, error analyses). */
  notes: string[];
}

interface PhotoRunInput {
  photo: string;
  photoIndex: number;
  /** Label for the harness's diagnostic log lines (job / photo / attempt). */
  tag?: string;
  kidContext: GradeRequestPayload["kidContext"];
  onStep: (step: string) => void;
  onIdentified?: (info: IdentifiedSheet) => void;
  /** Return true when this sheet is already graded in this job. */
  shouldStopAfterIdentify?: (sheetId: string) => boolean;
}

export interface GradingProvider {
  id: string;
  model: string;
  runPhoto: (input: PhotoRunInput) => Promise<PhotoAttempt>;
}

function piProvider(id: string): GradingProvider {
  const config = loadPiConfig();
  const def = providerDef(config, id);
  return {
    id,
    model: def?.models[0]?.id ?? "",
    async runPhoto({ photo, tag, kidContext, onStep, onIdentified, shouldStopAfterIdentify }) {
      const apiKey = resolveProviderApiKey(config, id);
      const { gradePhotoWithPiHarness } = await import("./pi-harness");
      const attempt = await gradePhotoWithPiHarness({
        photo,
        tag,
        kidContext,
        providerId: id,
        modelId: effectiveModel(config, "math", id),
        apiKey,
        onStep,
        onIdentified,
        shouldStopAfterIdentify,
      });
      return attempt;
    },
  };
}

export function resolveProvider(id: string): GradingProvider | null {
  const config = loadPiConfig();
  if (!providerDef(config, id) || !providerKeyAvailable(config, id)) return null;
  return piProvider(id);
}

export function listProviders(): { id: string; model: string; available: boolean }[] {
  const config = loadPiConfig();
  return Object.entries(config.providers).map(([id, def]) => ({
    id,
    model: def.models[0]?.id ?? "",
    available: providerKeyAvailable(config, id),
  }));
}
