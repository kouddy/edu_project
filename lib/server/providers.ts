/**
 * lib/server/providers.ts — grading providers behind one per-photo
 * interface (Stage 3.5: the job runner in lib/server/run-grade.ts owns
 * attempts, dedupe, and aggregation; a provider grades ONE photo per call).
 *
 * The scripted demo provider reproduces the prototype's demo verdict
 * patterns from the server registry, with no model call — the same
 * per-photo shape the real providers return. It is a development tool
 * only, selected explicitly with GRADING_PROVIDER=demo; it is never a
 * fallback. Real providers are defined in lib/server/pi/models.json
 * (Pi's native provider/model format) and all run through the one Pi
 * harness — adding a provider is a file edit.
 */

import type { ApiSheetResult, GradeRequestPayload, PhotoOutcomeKind } from "../grade-contract";
import { GINA_MATH_SETC, GINA_MATH_W12, SETC_DEMO_GRADES, W12_DEMO_GRADES } from "../seed";
import {
  effectiveModel,
  loadPiConfig,
  providerDef,
  providerKeyAvailable,
  resolveProviderApiKey,
} from "./pi-config";
import type { IdentifiedSheet } from "./pi-harness";
import { findBySheetId, sheetLabelForEntry, type RegistryEntry } from "./registry";

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
  kidContext: GradeRequestPayload["kidContext"];
  onStep: (step: string) => void;
  onIdentified?: (info: IdentifiedSheet) => void;
  /** Stage 3.5 §4: return true when this sheet is already graded in this job. */
  shouldStopAfterIdentify?: (sheetId: string) => boolean;
}

export interface GradingProvider {
  id: string;
  model: string;
  runPhoto: (input: PhotoRunInput) => Promise<PhotoAttempt>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plausible demo error categories, keyed `${sheetId}:${questionNumber}`. */
const DEMO_ERROR_CATEGORIES: Record<string, string> = {
  [`${GINA_MATH_W12}:4`]: "borrowing-slip",
};

function identifiedFor(entry: RegistryEntry): IdentifiedSheet {
  return {
    sheetId: entry.sheetId,
    printedCode: entry.printedCode,
    kidName: entry.kidName,
    sheetLabel: sheetLabelForEntry(entry),
  };
}

function demoSheetResult(
  sheetId: string,
  pattern: readonly { questionNumber: number; verdict: "correct" | "wrong" | "unsure"; confidence: number; readAnswer: string }[],
): ApiSheetResult {
  const entry = findBySheetId(sheetId);
  if (!entry) throw new Error(`Demo provider: no registry entry for ${sheetId}`);
  const keyByNumber = new Map(entry.questions.map((q) => [q.number, q]));
  return {
    sheetId: entry.sheetId,
    kidId: entry.kidId,
    printedCode: entry.printedCode,
    keyVersion: entry.keyVersion,
    perQuestion: pattern.map((g) => {
      const keyQ = keyByNumber.get(g.questionNumber);
      // Stage 3.5: the demo pattern's Q10 on Week 12 is a BLANK answer, so
      // the no-answer flow is exercisable without a model call. (The seed's
      // shared W12_DEMO_GRADES is untouched — the pre-graded seed record
      // keeps its original pattern.)
      if (sheetId === GINA_MATH_W12 && g.questionNumber === 10) {
        return {
          questionNumber: 10,
          verdict: "wrong" as const,
          confidence: 1,
          readAnswer: null,
          meta: {
            ...(keyQ ? { topic: keyQ.topic } : {}),
            noAnswer: true,
            ...(keyQ ? { guidance: keyQ.explanation } : {}),
          },
        };
      }
      return {
        questionNumber: g.questionNumber,
        verdict: g.verdict,
        confidence: g.confidence,
        readAnswer: g.readAnswer,
        meta: keyQ
          ? {
              topic: keyQ.topic,
              ...(g.verdict === "wrong"
                ? {
                    errorCategory: DEMO_ERROR_CATEGORIES[`${sheetId}:${g.questionNumber}`] ?? "unexplained",
                    guidance: keyQ.explanation,
                  }
                : {}),
            }
          : undefined,
      };
    }),
  };
}

const demoProvider: GradingProvider = {
  id: "demo",
  model: "demo-scripted",
  async runPhoto({ photoIndex, onStep, onIdentified, shouldStopAfterIdentify }) {
    const steps: string[] = [];
    const step = async (label: string, ms: number) => {
      steps.push(label);
      onStep(label);
      await sleep(ms);
    };

    await step("Reading the sheet", 350);
    // Demo identification: the first staged photo is Gina's Math · Week 12;
    // any further photo is Math · Set C — the prototype's pattern.
    const sheetId = photoIndex === 0 ? GINA_MATH_W12 : GINA_MATH_SETC;
    const entry = findBySheetId(sheetId);
    if (!entry) throw new Error(`Demo provider: no registry entry for ${sheetId}`);
    const identified = identifiedFor(entry);
    onIdentified?.(identified);
    if (shouldStopAfterIdentify?.(sheetId)) {
      return { kind: "duplicate", identified, steps, notes: [] };
    }

    await step("Marking answers", 350);
    const sheet = demoSheetResult(
      sheetId,
      sheetId === GINA_MATH_SETC ? SETC_DEMO_GRADES : W12_DEMO_GRADES,
    );

    if (sheet.perQuestion.some((q) => q.verdict === "wrong")) {
      await step("Writing guidance for the tricky ones", 250);
    }

    return { kind: "graded", sheet, identified, steps, notes: [] };
  },
};

/**
 * A real provider: any provider defined in lib/server/pi/models.json,
 * run through the Pi harness. Resolvable only when the provider's API key
 * is set on the server (or it is keyless by design), so a keyless
 * deployment fails honestly with the runner's "provider not available"
 * error instead of silently grading with something else.
 */
function piProvider(id: string): GradingProvider {
  const config = loadPiConfig();
  const def = providerDef(config, id);
  return {
    id,
    model: def?.models[0]?.id ?? "",
    async runPhoto({ photo, kidContext, onStep, onIdentified, shouldStopAfterIdentify }) {
      const apiKey = resolveProviderApiKey(config, id);
      const { gradePhotoWithPiHarness } = await import("./pi-harness");
      const attempt = await gradePhotoWithPiHarness({
        photo,
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
  if (id === "demo") return demoProvider;
  const config = loadPiConfig();
  if (!providerDef(config, id) || !providerKeyAvailable(config, id)) return null;
  return piProvider(id);
}

export function listProviders(): { id: string; model: string; available: boolean }[] {
  const config = loadPiConfig();
  return [
    { id: demoProvider.id, model: demoProvider.model, available: true },
    ...Object.entries(config.providers).map(([id, def]) => ({
      id,
      model: def.models[0]?.id ?? "",
      available: providerKeyAvailable(config, id),
    })),
  ];
}
