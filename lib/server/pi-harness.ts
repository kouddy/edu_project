/**
 * lib/server/pi-harness.ts — the Pi SDK grading harness (Phases 2–3).
 *
 * One ephemeral, in-memory Pi session per photo. The session is built with
 * full explicit control — no ambient discovery:
 * - a hand-written ResourceLoader whose system prompt is assembled from the
 *   configured prompt files (lib/server/pi/prompts) and whose only context file
 *   is the subject's taxonomy;
 * - SettingsManager.inMemory from lib/server/pi/settings.json values;
 * - SessionManager.inMemory — nothing is persisted;
 * - Pi's built-in tools are suppressed (noTools: "builtin"); the only tools
 *   are our schema-typed submit_* tools, whose parameters ARE the result
 *   shape and whose execute functions validate server-side.
 *
 * Flow per photo: the agent calls submit_identification (the tool looks the
 * printed code up in the server registry and hands back the answer key),
 * then submit_grade (validated here: every key question exactly once, and
 * the confidence rule is enforced — a verdict under the configured
 * threshold is coerced to "unsure"; the agent cannot argue past it). When
 * the grade has wrong answers, the agent continues in the same session:
 * submit_error_analysis categorizes each wrong answer against the subject
 * taxonomy, then submit_guidance writes per-question guidance (what
 * happened / worked steps / try one like it). Analysis and guidance are
 * best-effort extras: whatever the agent submits is merged into each wrong
 * question's meta; a sheet still grades fine if it submits neither, and
 * the client falls back to the key's static explanation.
 *
 * Providers and models come from lib/server/pi/models.json — Pi's own
 * native format (providers → baseUrl / api / apiKey with "$ENV_VAR"
 * interpolation / models). The harness hands Pi's ModelRuntime a copy of
 * that file from a temp dir (so Pi can never mutate the committed config)
 * and passes the resolved API key via setRuntimeApiKey; keys are never
 * written to a committed file. Adding a provider is a models.json edit.
 * Which models belong in that file is a product decision recorded in
 * docs/stage-3-design.md (see the contributor-tier note there).
 */

import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type {
  ApiQuestionGrade,
  ApiSheetResult,
  KidContext,
} from "../grade-contract";
import { loadPiConfig, loadPrompt, subjectManifest, type PiConfig } from "./pi-config";
import { findByPrintedCode, sheetLabelForEntry as sheetLabelFor, type RegistryEntry } from "./registry";

const PER_PHOTO_TIMEOUT_MS = 150_000;

const STEP_BY_TOOL: Record<string, string> = {
  submit_identification: "Reading the sheet",
  submit_grade: "Marking answers",
  submit_error_analysis: "Understanding the mistakes",
  submit_guidance: "Writing guidance",
};

interface Captured {
  entry: RegistryEntry | null;
  rejection: string | null;
  /** Stage 3.5 §2: whether a rejection can never change on a retry. */
  rejectionKind: "read" | "deterministic" | null;
  /** Stage 3.5 §4: the runner said this sheet is already graded in this job. */
  duplicate: boolean;
  /** How many printed-code lookups have failed in this session. */
  codeAttempts: number;
  perQuestion: ApiQuestionGrade[] | null;
  coercedUnsure: number[];
  /** Phase 3: questionNumber → taxonomy category + what the student likely did. */
  analyses: Map<number, { category: string; observation: string }>;
  /** Phase 3: questionNumber → generated guidance text. */
  guidances: Map<number, string>;
}

export interface IdentifiedSheet {
  sheetId: string;
  printedCode: string;
  kidName: string;
  /** "Gina · Math · Week 12" — for progress displays. */
  sheetLabel: string;
}

/** Taxonomy category ids are the bold slugs in the taxonomy context file. */
function taxonomyCategoryIds(taxonomy: string): string[] {
  const ids = [...taxonomy.matchAll(/\*\*([a-z][a-z0-9-]*)\*\*/g)].map((m) => m[1]);
  return ids.length > 0 ? [...new Set(ids)] : ["unexplained"];
}

function parseDataUrl(dataUrl: string): { data: string; mimeType: string } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Photo was not a base64 data URL.");
  return { mimeType: match[1], data: match[2] };
}

function wrongNumbers(captured: Captured): number[] {
  return (captured.perQuestion ?? []).filter((g) => g.verdict === "wrong").map((g) => g.questionNumber);
}

function buildTools(
  captured: Captured,
  threshold: number,
  categoryIds: string[],
  hooks: {
    onIdentified?: (info: IdentifiedSheet) => void;
    shouldStopAfterIdentify?: (sheetId: string) => boolean;
  } = {},
) {
  const submitIdentification = defineTool({
    name: "submit_identification",
    label: "Submit identification",
    description:
      "Report what you found in the photo: the printed sheet code, the student's name, and whether the photo is usable.",
    parameters: Type.Object({
      printedCode: Type.String({ description: "The printed sheet code, character for character." }),
      studentName: Type.String({ description: "The student's name as handwritten on the sheet." }),
      photoUsable: Type.Boolean({ description: "False if the photo is too blurry/dark/cropped to grade." }),
      rejectReason: Type.Optional(
        Type.String({ description: "If photoUsable is false, a short plain-language reason a parent can act on." }),
      ),
    }),
    execute: async (_id, params) => {
      if (!params.photoUsable) {
        captured.rejection = params.rejectReason ?? "We couldn't read that photo.";
        captured.rejectionKind = "read";
        return { content: [{ type: "text" as const, text: "Recorded: the photo is unusable. Stop here." }], details: {} };
      }
      const entry = findByPrintedCode(params.printedCode.trim().toUpperCase());
      if (!entry) {
        captured.codeAttempts += 1;
        if (captured.codeAttempts >= 2) {
          // The code has been re-read carefully and still matches nothing
          // we know — retrying this photo cannot change that (Stage 3.5 §2).
          captured.rejection = "We couldn't find that sheet — the photo needs to show the code printed in the corner.";
          captured.rejectionKind = "deterministic";
          return { content: [{ type: "text" as const, text: "Recorded: not one of our sheets. Stop here." }], details: {} };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `The code "${params.printedCode}" is not one of our sheets. Look at the photo again and re-read the printed code character by character, then call submit_identification again. If no code is clearly printed, call it with photoUsable=false.`,
            },
          ],
          details: {},
        };
      }
      if (entry.questions.length === 0) {
        captured.rejection = "We don't have the answer key for that sheet yet.";
        captured.rejectionKind = "deterministic";
        return { content: [{ type: "text" as const, text: "Recorded: no key for this sheet. Stop here." }], details: {} };
      }
      captured.entry = entry;
      hooks.onIdentified?.({
        sheetId: entry.sheetId,
        printedCode: entry.printedCode,
        kidName: entry.kidName,
        sheetLabel: sheetLabelFor(entry),
      });
      if (hooks.shouldStopAfterIdentify?.(entry.sheetId)) {
        captured.duplicate = true;
        return {
          content: [{ type: "text" as const, text: "Recorded: this sheet was already marked in this batch. Stop here — do not grade it again." }],
          details: {},
        };
      }
      const key = entry.questions.map((q) => ({
        number: q.number,
        prompt: q.prompt,
        correctAnswer: q.correctAnswer,
        topic: q.topic,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Identified: ${entry.kidName}, Grade ${entry.kidGrade} — ${entry.subject}, Week ${entry.week}${entry.setName ? ` (${entry.setName})` : ""}. Name on the sheet reads "${params.studentName}".`,
              `Answer key (grade against exactly this): ${JSON.stringify(key)}`,
              "Now grade every question from the photo and call submit_grade once with all verdicts.",
            ].join("\n"),
          },
        ],
        details: {},
      };
    },
  });

  const submitGrade = defineTool({
    name: "submit_grade",
    label: "Submit grade",
    description: "Submit the final verdict for every question on the identified sheet.",
    parameters: Type.Object({
      grades: Type.Array(
        Type.Object({
          questionNumber: Type.Number(),
          verdict: Type.Union([Type.Literal("correct"), Type.Literal("wrong"), Type.Literal("unsure")]),
          confidence: Type.Number({ minimum: 0, maximum: 1 }),
          readAnswer: Type.Union([Type.String(), Type.Null()]),
          noAnswer: Type.Optional(
            Type.Boolean({
              description:
                "True only when the answer space is completely empty — nothing written at all. Any visible mark (faint writing, a smudge, an erased ghost) is NOT blank: read it or mark it unsure instead.",
            }),
          ),
        }),
      ),
    }),
    execute: async (_id, params) => {
      const entry = captured.entry;
      if (!entry) {
        return {
          content: [{ type: "text" as const, text: "Identify the sheet first (submit_identification), then grade." }],
          details: {},
        };
      }
      const expected = new Set(entry.questions.map((q) => q.number));
      const seen = new Set<number>();
      for (const g of params.grades) {
        if (!expected.has(g.questionNumber)) {
          return {
            content: [{ type: "text" as const, text: `Question ${g.questionNumber} is not on this sheet. Submit exactly questions ${[...expected].join(", ")}.` }],
            details: {},
          };
        }
        if (seen.has(g.questionNumber)) {
          return {
            content: [{ type: "text" as const, text: `Question ${g.questionNumber} appears twice. Submit each question once.` }],
            details: {},
          };
        }
        seen.add(g.questionNumber);
      }
      if (seen.size !== expected.size) {
        return {
          content: [{ type: "text" as const, text: `Missing questions: ${[...expected].filter((n) => !seen.has(n)).join(", ")}. Submit a verdict for every question.` }],
          details: {},
        };
      }
      const topicByNumber = new Map(entry.questions.map((q) => [q.number, q.topic]));
      captured.perQuestion = params.grades
        .slice()
        .sort((a, b) => a.questionNumber - b.questionNumber)
        .map((g) => {
          // Stage 3.5 §1: an explicitly asserted blank is its own signal —
          // wrong, no read answer, never a Parent check item. If the agent
          // is not confident the space is truly empty, it stays unsure:
          // the never-guess rule covers blankness too.
          if (g.noAnswer) {
            if (g.confidence < threshold) {
              return {
                questionNumber: g.questionNumber,
                verdict: "unsure" as const,
                confidence: g.confidence,
                readAnswer: null,
                meta: { topic: topicByNumber.get(g.questionNumber) },
              };
            }
            return {
              questionNumber: g.questionNumber,
              verdict: "wrong" as const,
              confidence: g.confidence,
              readAnswer: null,
              meta: { topic: topicByNumber.get(g.questionNumber), noAnswer: true },
            };
          }
          let verdict = g.verdict;
          if (verdict !== "unsure" && g.confidence < threshold) {
            verdict = "unsure";
            captured.coercedUnsure.push(g.questionNumber);
          }
          return {
            questionNumber: g.questionNumber,
            verdict,
            confidence: g.confidence,
            readAnswer: g.readAnswer,
            meta: { topic: topicByNumber.get(g.questionNumber) },
          };
        });
      const wrong = wrongNumbers(captured);
      if (wrong.length === 0) {
        return { content: [{ type: "text" as const, text: "Grade recorded. No wrong answers to analyze. You are done — stop here." }], details: {} };
      }
      const detail = captured.perQuestion!
        .filter((g) => g.verdict === "wrong")
        .map((g) => {
          const keyQ = entry.questions.find((q) => q.number === g.questionNumber);
          const wrote = g.meta?.noAnswer ? "(no answer written)" : (g.readAnswer ?? "(unreadable)");
          return `Q${g.questionNumber}: ${keyQ?.prompt ?? ""} — correct answer ${keyQ?.correctAnswer ?? ""}, student wrote ${wrote}`;
        })
        .join("\n");
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Grade recorded. ${wrong.length} wrong answer(s) need error analysis and guidance:`,
              detail,
              "Next: call submit_error_analysis once, covering every wrong question, choosing one category per question from the taxonomy. Then call submit_guidance once, with guidance for every wrong question.",
            ].join("\n"),
          },
        ],
        details: {},
      };
    },
  });

  const submitErrorAnalysis = defineTool({
    name: "submit_error_analysis",
    label: "Submit error analysis",
    description:
      "For each wrong answer, submit the single best-fitting error category from the taxonomy and one short sentence on what the student most likely did.",
    parameters: Type.Object({
      analyses: Type.Array(
        Type.Object({
          questionNumber: Type.Number(),
          category: Type.String({ description: "One taxonomy category id, exactly as written in the taxonomy." }),
          observation: Type.String({ description: "One short sentence: what the student most likely did." }),
        }),
      ),
    }),
    execute: async (_id, params) => {
      if (!captured.perQuestion) {
        return { content: [{ type: "text" as const, text: "Grade the sheet first (submit_grade), then analyze." }], details: {} };
      }
      const wrong = wrongNumbers(captured);
      const problems: string[] = [];
      for (const a of params.analyses) {
        if (!wrong.includes(a.questionNumber)) {
          problems.push(`Q${a.questionNumber} is not a wrong answer on this sheet (wrong: ${wrong.join(", ") || "none"}).`);
          continue;
        }
        if (!categoryIds.includes(a.category)) {
          problems.push(`"${a.category}" for Q${a.questionNumber} is not a taxonomy category. Use one of: ${categoryIds.join(", ")}.`);
          continue;
        }
        captured.analyses.set(a.questionNumber, { category: a.category, observation: a.observation });
      }
      const missing = wrong.filter((n) => !captured.analyses.has(n));
      if (problems.length > 0) {
        return {
          content: [{ type: "text" as const, text: `Some analyses were not recorded:\n${problems.join("\n")}\nFix those and call submit_error_analysis again for them.` }],
          details: {},
        };
      }
      if (missing.length > 0) {
        return {
          content: [{ type: "text" as const, text: `Analysis recorded for some questions. Still missing: Q${missing.join(", Q")}. Call submit_error_analysis again for those.` }],
          details: {},
        };
      }
      return {
        content: [{ type: "text" as const, text: "Error analysis recorded for every wrong answer. Now call submit_guidance once, with guidance for every wrong question, using its category to aim the teaching at the step that broke." }],
        details: {},
      };
    },
  });

  const submitGuidance = defineTool({
    name: "submit_guidance",
    label: "Submit guidance",
    description:
      "For each wrong answer, submit the guidance text for the student: what happened (one kind sentence), the worked steps (one per line), and a 'Try one like it:' question with its answer left out.",
    parameters: Type.Object({
      guidances: Type.Array(
        Type.Object({
          questionNumber: Type.Number(),
          guidance: Type.String({ description: "The full guidance text for this question, parts separated by line breaks." }),
        }),
      ),
    }),
    execute: async (_id, params) => {
      if (!captured.perQuestion) {
        return { content: [{ type: "text" as const, text: "Grade the sheet first (submit_grade), then write guidance." }], details: {} };
      }
      const wrong = wrongNumbers(captured);
      const problems: string[] = [];
      for (const g of params.guidances) {
        if (!wrong.includes(g.questionNumber)) {
          problems.push(`Q${g.questionNumber} is not a wrong answer on this sheet (wrong: ${wrong.join(", ") || "none"}).`);
          continue;
        }
        const text = g.guidance.trim();
        if (text.length < 20) {
          problems.push(`Guidance for Q${g.questionNumber} is too short to teach anything — include what happened, the worked steps, and a try-one-like-it question.`);
          continue;
        }
        captured.guidances.set(g.questionNumber, text);
      }
      const missingGuidance = wrong.filter((n) => !captured.guidances.has(n));
      const missingAnalysis = wrong.filter((n) => !captured.analyses.has(n));
      if (problems.length > 0) {
        return {
          content: [{ type: "text" as const, text: `Some guidance was not recorded:\n${problems.join("\n")}\nFix those and call submit_guidance again for them.` }],
          details: {},
        };
      }
      if (missingGuidance.length > 0) {
        return {
          content: [{ type: "text" as const, text: `Guidance recorded for some questions. Still missing: Q${missingGuidance.join(", Q")}. Call submit_guidance again for those.` }],
          details: {},
        };
      }
      if (missingAnalysis.length > 0) {
        return {
          content: [{ type: "text" as const, text: "Guidance recorded. Error analysis is still missing for Q" + missingAnalysis.join(", Q") + " — call submit_error_analysis for those, then you are done." }],
          details: {},
        };
      }
      return { content: [{ type: "text" as const, text: "Guidance recorded. You are done — stop here." }], details: {} };
    },
  });

  return [submitIdentification, submitGrade, submitErrorAnalysis, submitGuidance];
}

async function createModelRuntime(config: PiConfig, providerId: string, apiKey: string | null): Promise<ModelRuntime> {
  const dir = mkdtempSync(path.join(tmpdir(), "pi-grading-"));
  const modelsCopy = path.join(dir, "models.json");
  copyFileSync(config.modelsPath, modelsCopy);
  const runtime = await ModelRuntime.create({
    authPath: path.join(dir, "auth.json"),
    modelsPath: modelsCopy,
  });
  if (apiKey) await runtime.setRuntimeApiKey(providerId, apiKey);
  return runtime;
}

interface PhotoOutcome {
  sheet?: ApiSheetResult;
  rejection?: string;
  rejectionKind?: "read" | "deterministic";
  duplicate?: boolean;
  identified?: IdentifiedSheet;
  steps: string[];
  coercedUnsure: number[];
  /** Phase 3 trace summary, e.g. "Q4: borrowing-slip". */
  analysisSummary: string[];
}

async function gradeOnePhoto(args: {
  config: PiConfig;
  runtime: ModelRuntime;
  providerId: string;
  modelId: string;
  photoDataUrl: string;
  kidContext: KidContext[];
  onStep: (step: string) => void;
  onIdentified?: (info: IdentifiedSheet) => void;
  shouldStopAfterIdentify?: (sheetId: string) => boolean;
}): Promise<PhotoOutcome> {
  const { config, runtime, providerId, modelId } = args;
  const manifest = subjectManifest(config, "math");
  const threshold = config.settings.confidenceThreshold;
  const taxonomyRel = manifest.contextFiles[0];
  const taxonomy = taxonomyRel ? readFileSync(path.join(config.configDir, taxonomyRel), "utf8") : "";

  const systemPrompt = [
    "You are the grading agent of a children's practice-sheet service. You work in order: identify the sheet with submit_identification, grade it with submit_grade, and — only when the grade has wrong answers — categorize the errors with submit_error_analysis and write guidance with submit_guidance. Do not write explanations to the parent; only tool calls matter.",
    loadPrompt(config, "math", "identify"),
    loadPrompt(config, "math", "grade"),
    ...(manifest.promptFiles.errorAnalysis ? [loadPrompt(config, "math", "errorAnalysis")] : []),
    ...(manifest.promptFiles.guidance ? [loadPrompt(config, "math", "guidance")] : []),
  ].join("\n\n");

  const resourceLoader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({
      agentsFiles: taxonomy ? [{ path: "math-error-taxonomy.md", content: taxonomy }] : [],
    }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };

  const model = runtime.getModel(providerId, modelId);
  if (!model) throw new Error(`Model ${providerId}/${modelId} is not defined in lib/server/pi/models.json.`);

  const captured: Captured = {
    entry: null,
    rejection: null,
    rejectionKind: null,
    duplicate: false,
    codeAttempts: 0,
    perQuestion: null,
    coercedUnsure: [],
    analyses: new Map(),
    guidances: new Map(),
  };
  const steps: string[] = [];
  const { session } = await createAgentSession({
    cwd: process.cwd(),
    model,
    thinkingLevel: (config.settings.thinkingLevel ?? "medium") as never,
    modelRuntime: runtime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(process.cwd()),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: config.settings.maxRetries },
    }),
    noTools: "builtin",
    customTools: buildTools(captured, threshold, taxonomyCategoryIds(taxonomy), {
      onIdentified: args.onIdentified,
      shouldStopAfterIdentify: args.shouldStopAfterIdentify,
    }),
  });

  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      const label = STEP_BY_TOOL[event.toolName];
      if (label) {
        if (!steps.includes(label)) steps.push(label);
        args.onStep(label);
      }
    }
  });

  try {
    const { data, mimeType } = parseDataUrl(args.photoDataUrl);
    const kids = args.kidContext.map((k) => `${k.name} (Grade ${k.grade})`).join(", ");
    const promptText = [
      "Grade the worksheet in this photo.",
      kids ? `The account's children: ${kids}.` : "",
      "First call submit_identification with the printed code and the name on the sheet. The tool will give you the answer key. Then call submit_grade with a verdict for every question. If any answers are wrong, the grading tool will ask you to analyze the errors and write guidance for them. If the photo cannot be graded, submit_identification with photoUsable=false and a plain reason.",
    ]
      .filter(Boolean)
      .join("\n");

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        session.prompt(promptText, { images: [{ type: "image", data, mimeType }] }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Grading timed out.")), PER_PHOTO_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      await session.abort().catch(() => {});
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } finally {
    unsubscribe();
    session.dispose();
  }

  const identified: IdentifiedSheet | undefined = captured.entry
    ? {
        sheetId: captured.entry.sheetId,
        printedCode: captured.entry.printedCode,
        kidName: captured.entry.kidName,
        sheetLabel: sheetLabelFor(captured.entry),
      }
    : undefined;
  if (captured.duplicate) {
    return { duplicate: true, identified, steps, coercedUnsure: [], analysisSummary: [] };
  }
  if (captured.rejection) {
    return {
      rejection: captured.rejection,
      rejectionKind: captured.rejectionKind ?? "read",
      identified,
      steps,
      coercedUnsure: captured.coercedUnsure,
      analysisSummary: [],
    };
  }
  if (captured.entry && captured.perQuestion) {
    const analysisSummary: string[] = [];
    const perQuestion = captured.perQuestion.map((g) => {
      if (g.verdict !== "wrong") return g;
      const analysis = captured.analyses.get(g.questionNumber);
      const guidance = captured.guidances.get(g.questionNumber);
      if (analysis) analysisSummary.push(`Q${g.questionNumber}: ${analysis.category}`);
      if (!analysis && !guidance) return g;
      return {
        ...g,
        meta: {
          ...g.meta,
          ...(analysis ? { errorCategory: analysis.category } : {}),
          ...(guidance ? { guidance } : {}),
        },
      };
    });
    return {
      sheet: {
        sheetId: captured.entry.sheetId,
        kidId: captured.entry.kidId,
        printedCode: captured.entry.printedCode,
        keyVersion: captured.entry.keyVersion,
        perQuestion,
      },
      identified,
      steps,
      coercedUnsure: captured.coercedUnsure,
      analysisSummary,
    };
  }
  throw new Error("The grading agent finished without identifying or grading the sheet.");
}

/** The runner's per-photo result from the Pi harness (Stage 3.5 §2). */
export interface PiPhotoAttempt {
  kind: "graded" | "duplicate" | "rejected-deterministic" | "rejected-read" | "failed";
  sheet?: ApiSheetResult;
  identified?: IdentifiedSheet;
  reason?: string;
  steps: string[];
  /** Trace note fragments (confidence coercions, error analyses). */
  notes: string[];
}

/** Grade ONE photo with the Pi harness on a models.json provider. */
export async function gradePhotoWithPiHarness(args: {
  photo: string;
  kidContext: KidContext[];
  providerId: string;
  modelId: string;
  apiKey: string | null;
  onStep: (step: string) => void;
  onIdentified?: (info: IdentifiedSheet) => void;
  shouldStopAfterIdentify?: (sheetId: string) => boolean;
}): Promise<PiPhotoAttempt> {
  const config = loadPiConfig();
  const runtime = await createModelRuntime(config, args.providerId, args.apiKey);
  let outcome: PhotoOutcome;
  try {
    outcome = await gradeOnePhoto({
      config,
      runtime,
      providerId: args.providerId,
      modelId: args.modelId,
      photoDataUrl: args.photo,
      kidContext: args.kidContext,
      onStep: args.onStep,
      onIdentified: args.onIdentified,
      shouldStopAfterIdentify: args.shouldStopAfterIdentify,
    });
  } catch (err) {
    // Timeouts, provider errors, and a session that ends without a result
    // are transient failures — the runner may retry them (Stage 3.5 §3).
    return {
      kind: "failed",
      reason: err instanceof Error ? err.message : "Grading failed.",
      steps: [],
      notes: [],
    };
  }

  const notes: string[] = [];
  if (outcome.coercedUnsure.length > 0) {
    notes.push(
      `Confidence rule enforced server-side: Q${outcome.coercedUnsure.join(", Q")} coerced to unsure (below ${config.settings.confidenceThreshold}).`,
    );
  }
  if (outcome.analysisSummary.length > 0) {
    notes.push(`Error analysis: ${outcome.analysisSummary.join("; ")}.`);
  }
  if (outcome.duplicate) {
    return { kind: "duplicate", identified: outcome.identified, steps: outcome.steps, notes };
  }
  if (outcome.rejection) {
    return {
      kind: outcome.rejectionKind === "deterministic" ? "rejected-deterministic" : "rejected-read",
      reason: outcome.rejection,
      identified: outcome.identified,
      steps: outcome.steps,
      notes,
    };
  }
  return { kind: "graded", sheet: outcome.sheet, identified: outcome.identified, steps: outcome.steps, notes };
}
