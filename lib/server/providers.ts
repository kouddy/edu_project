/**
 * lib/server/providers.ts — grading providers behind one per-photo
 * interface (the job runner in lib/server/run-grade.ts owns
 * attempts, dedupe, and aggregation; a provider grades ONE photo per call).
 *
 * The scripted demo provider returns canned verdict patterns built
 * from real book keys in the server registry, with no model call — the
 * same per-photo shape the real providers return. It is a development
 * tool only, selected explicitly with GRADING_PROVIDER=demo; it is
 * never a fallback. Real providers are defined in lib/server/pi/models.json
 * (Pi's native provider/model format) and all run through the one Pi
 * harness — adding a provider is a file edit.
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function identifiedFor(entry: RegistryEntry): IdentifiedSheet {
  return {
    sheetId: entry.sheetId,
    printedCode: entry.printedCode,
    kidName: entry.kidName,
    sheetLabel: sheetLabelForEntry(entry),
  };
}

/** The scripted provider's anchors: real book sheets from the registry. */
const DEMO_ANCHOR_FIRST = "book-on-math-g3-w40-s01";
const DEMO_ANCHOR_REST = "book-on-math-g4-w40-s01";

/** Bump an answer's last digit — a plausible misread of it. */
function misread(answer: string): string {
  const chars = [...answer];
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/\d/.test(chars[i])) {
      chars[i] = String((Number(chars[i]) + 1) % 10);
      return chars.join("");
    }
  }
  return answer;
}

function demoSheetResult(sheetId: string, first: boolean): ApiSheetResult {
  const entry = findBySheetId(sheetId);
  if (!entry) throw new Error(`Demo provider: no registry entry for ${sheetId}`);
  const qs = entry.questions;
  // The canned pattern, built from the anchor's own key: the first
  // digit-bearing answer after Q1 is wrong (a misread digit); on the
  // first photo the second-to-last answer is unsure and the last one
  // is blank, so the parent-check and no-answer flows are exercisable
  // without a model call too.
  const wrongIdx = qs.findIndex((q, i) => i >= 1 && /\d/.test(q.correctAnswer));
  const perQuestion = qs.map((q, i) => {
    if (first && i === qs.length - 1) {
      return {
        questionNumber: q.number,
        verdict: "wrong" as const,
        confidence: 1,
        readAnswer: null,
        meta: { topic: q.topic, noAnswer: true, guidance: q.explanation },
      };
    }
    if (first && i === qs.length - 2) {
      return {
        questionNumber: q.number,
        verdict: "unsure" as const,
        confidence: 0.55,
        readAnswer: q.correctAnswer,
        meta: { topic: q.topic },
      };
    }
    if (i === wrongIdx) {
      return {
        questionNumber: q.number,
        verdict: "wrong" as const,
        confidence: 0.94,
        readAnswer: misread(q.correctAnswer),
        meta: { topic: q.topic, errorCategory: "unexplained", guidance: q.explanation },
      };
    }
    return {
      questionNumber: q.number,
      verdict: "correct" as const,
      confidence: 0.98,
      readAnswer: q.correctAnswer,
      meta: { topic: q.topic },
    };
  });
  return {
    sheetId: entry.sheetId,
    kidId: entry.kidId,
    printedCode: entry.printedCode,
    keyVersion: entry.keyVersion,
    perQuestion,
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
    // Demo identification: the first staged photo is Amy's Week 40
    // opener (Grade 3); any further photo is Bob's (Grade 4).
    const sheetId = photoIndex === 0 ? DEMO_ANCHOR_FIRST : DEMO_ANCHOR_REST;
    const entry = findBySheetId(sheetId);
    if (!entry) throw new Error(`Demo provider: no registry entry for ${sheetId}`);
    const identified = identifiedFor(entry);
    onIdentified?.(identified);
    if (shouldStopAfterIdentify?.(sheetId)) {
      return { kind: "duplicate", identified, steps, notes: [] };
    }

    await step("Marking answers", 350);
    const sheet = demoSheetResult(sheetId, photoIndex === 0);

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
