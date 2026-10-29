/**
 * lib/server/providers.ts — grading providers behind one interface.
 *
 * A provider takes staged photos + kid context and produces the result
 * contract (lib/grade-contract.ts). Phase 1 ships the scripted demo
 * provider: it reproduces the prototype's demo verdict patterns from the
 * server registry, with no model call — the same end-to-end shape the real
 * providers will return, and the fallback that keeps the app demoable with
 * no API key configured. Real providers (Meta Model API via the Pi harness)
 * land in Phase 2 and register in PROVIDERS below.
 */

import type { ApiSheetResult, GradeJobResult, GradeRequestPayload } from "../grade-contract";
import { GINA_MATH_SETC, GINA_MATH_W12, SETC_DEMO_GRADES, W12_DEMO_GRADES } from "../seed";
import { findBySheetId } from "./registry";

export interface ProviderRunInput extends GradeRequestPayload {
  onStep: (step: string) => void;
}

export interface GradingProvider {
  id: string;
  model: string;
  run: (input: ProviderRunInput) => Promise<GradeJobResult>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plausible demo error categories, keyed `${sheetId}:${questionNumber}`. */
const DEMO_ERROR_CATEGORIES: Record<string, string> = {
  [`${GINA_MATH_W12}:4`]: "borrowing-slip",
};

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

export const demoProvider: GradingProvider = {
  id: "demo",
  model: "demo-scripted",
  async run({ photos, onStep }) {
    const steps: string[] = [];
    const step = async (label: string, ms: number) => {
      steps.push(label);
      onStep(label);
      await sleep(ms);
    };

    await step("Reading the sheet", 350);
    // Demo identification: one staged photo is Gina's Math · Week 12; a
    // second photo is additionally Math · Set C — the prototype's pattern.
    const sheetIds = photos.length >= 2 ? [GINA_MATH_W12, GINA_MATH_SETC] : [GINA_MATH_W12];

    await step("Marking answers", 350);
    const sheets = sheetIds.map((id) =>
      demoSheetResult(id, id === GINA_MATH_SETC ? SETC_DEMO_GRADES : W12_DEMO_GRADES),
    );

    const wrongCount = sheets.reduce(
      (n, s) => n + s.perQuestion.filter((q) => q.verdict === "wrong").length,
      0,
    );
    if (wrongCount > 0) {
      await step("Writing guidance for the tricky ones", 250);
    }

    return {
      outcome: "graded",
      sheets,
      trace: {
        provider: "demo",
        model: "demo-scripted",
        steps,
        note: "Scripted demo provider — no model was called.",
      },
    };
  },
};

const PROVIDERS: Record<string, GradingProvider> = {
  demo: demoProvider,
};

export function resolveProvider(id: string): GradingProvider | null {
  return PROVIDERS[id] ?? null;
}

export function listProviders(): { id: string; model: string }[] {
  return Object.values(PROVIDERS).map((p) => ({ id: p.id, model: p.model }));
}
