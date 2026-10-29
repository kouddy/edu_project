/**
 * lib/server/pi-harness.ts — the Pi SDK grading harness (Phase 2).
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
 * threshold is coerced to "unsure"; the agent cannot argue past it).
 *
 * The Meta provider is registered programmatically on a ModelRuntime whose
 * auth/models files live in a temp dir — the API key arrives via
 * setRuntimeApiKey from the META_API_KEY / MODEL_API_KEY env var and is
 * never written to a committed file. Only Standard models are used: the
 * discounted "-contributor" variants train on prompts, which is not
 * acceptable for children's work.
 */

import { mkdtempSync, readFileSync } from "node:fs";
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
  GradeJobResult,
  KidContext,
} from "../grade-contract";
import { loadPiConfig, loadPrompt, subjectManifest, type PiConfig } from "./pi-config";
import { findByPrintedCode, type RegistryEntry } from "./registry";

const PROVIDER_ID = "meta";
const PER_PHOTO_TIMEOUT_MS = 150_000;

const STEP_BY_TOOL: Record<string, string> = {
  submit_identification: "Reading the sheet",
  submit_grade: "Marking answers",
};

interface Captured {
  entry: RegistryEntry | null;
  rejection: string | null;
  perQuestion: ApiQuestionGrade[] | null;
  coercedUnsure: number[];
}

function parseDataUrl(dataUrl: string): { data: string; mimeType: string } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Photo was not a base64 data URL.");
  return { mimeType: match[1], data: match[2] };
}

function buildTools(captured: Captured, threshold: number) {
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
        return { content: [{ type: "text" as const, text: "Recorded: the photo is unusable. Stop here." }], details: {} };
      }
      const entry = findByPrintedCode(params.printedCode.trim().toUpperCase());
      if (!entry) {
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
        return { content: [{ type: "text" as const, text: "Recorded: no key for this sheet. Stop here." }], details: {} };
      }
      captured.entry = entry;
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
      return { content: [{ type: "text" as const, text: "Grade recorded. You are done — stop here." }], details: {} };
    },
  });

  return [submitIdentification, submitGrade];
}

async function createModelRuntime(config: PiConfig, apiKey: string): Promise<{ runtime: ModelRuntime; modelId: string }> {
  const meta = config.settings.meta;
  if (!meta) throw new Error("Pi settings are missing the meta provider block.");
  const dir = mkdtempSync(path.join(tmpdir(), "pi-grading-"));
  const runtime = await ModelRuntime.create({
    authPath: path.join(dir, "auth.json"),
    modelsPath: path.join(dir, "models.json"),
  });
  runtime.registerProvider(PROVIDER_ID, {
    name: "Meta Model API",
    baseUrl: meta.baseUrl,
    api: "openai-completions",
    models: [
      {
        id: meta.model,
        name: "Muse Spark 1.3",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 1.25, output: 4.25, cacheRead: 0.15, cacheWrite: 1.25 },
        contextWindow: 1_048_576,
        maxTokens: 8192,
      },
    ],
  });
  await runtime.setRuntimeApiKey(PROVIDER_ID, apiKey);
  return { runtime, modelId: meta.model };
}

interface PhotoOutcome {
  sheet?: ApiSheetResult;
  rejection?: string;
  steps: string[];
  coercedUnsure: number[];
}

async function gradeOnePhoto(args: {
  config: PiConfig;
  runtime: ModelRuntime;
  modelId: string;
  photoDataUrl: string;
  kidContext: KidContext[];
  onStep: (step: string) => void;
}): Promise<PhotoOutcome> {
  const { config, runtime, modelId } = args;
  const manifest = subjectManifest(config, "math");
  const threshold = config.settings.confidenceThreshold;
  const taxonomyRel = manifest.contextFiles[0];
  const taxonomy = taxonomyRel ? readFileSync(path.join(config.configDir, taxonomyRel), "utf8") : "";

  const systemPrompt = [
    "You are the grading agent of a children's practice-sheet service. You work in exactly two steps: identify the sheet with submit_identification, then grade it with submit_grade. Do not write explanations to the parent; only tool calls matter.",
    loadPrompt(config, "math", "identify"),
    loadPrompt(config, "math", "grade"),
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

  const model = runtime.getModel(PROVIDER_ID, modelId);
  if (!model) throw new Error(`Model ${PROVIDER_ID}/${modelId} is not registered.`);

  const captured: Captured = { entry: null, rejection: null, perQuestion: null, coercedUnsure: [] };
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
    customTools: buildTools(captured, threshold),
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
      "First call submit_identification with the printed code and the name on the sheet. The tool will give you the answer key. Then call submit_grade with a verdict for every question. If the photo cannot be graded, submit_identification with photoUsable=false and a plain reason.",
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

  if (captured.rejection) return { rejection: captured.rejection, steps, coercedUnsure: captured.coercedUnsure };
  if (captured.entry && captured.perQuestion) {
    return {
      sheet: {
        sheetId: captured.entry.sheetId,
        kidId: captured.entry.kidId,
        printedCode: captured.entry.printedCode,
        keyVersion: captured.entry.keyVersion,
        perQuestion: captured.perQuestion,
      },
      steps,
      coercedUnsure: captured.coercedUnsure,
    };
  }
  throw new Error("The grading agent finished without identifying or grading the sheet.");
}

/** Grade all staged photos with the Pi harness on the Meta provider. */
export async function gradeWithPiHarness(args: {
  photos: string[];
  kidContext: KidContext[];
  apiKey: string;
  onStep: (step: string) => void;
}): Promise<GradeJobResult> {
  const config = loadPiConfig();
  const { runtime, modelId } = await createModelRuntime(config, args.apiKey);
  const sheets: ApiSheetResult[] = [];
  const allSteps: string[] = [];
  const coerced: number[] = [];

  for (const photo of args.photos) {
    const outcome = await gradeOnePhoto({
      config,
      runtime,
      modelId,
      photoDataUrl: photo,
      kidContext: args.kidContext,
      onStep: args.onStep,
    });
    for (const s of outcome.steps) if (!allSteps.includes(s)) allSteps.push(s);
    coerced.push(...outcome.coercedUnsure);
    if (outcome.rejection) {
      return {
        outcome: "rejected",
        reason: outcome.rejection,
        trace: { provider: PROVIDER_ID, model: modelId, steps: allSteps },
      };
    }
    if (outcome.sheet) sheets.push(outcome.sheet);
  }

  return {
    outcome: "graded",
    sheets,
    trace: {
      provider: PROVIDER_ID,
      model: modelId,
      steps: allSteps,
      ...(coerced.length > 0
        ? { note: `Confidence rule enforced server-side: Q${coerced.join(", Q")} coerced to unsure (below ${config.settings.confidenceThreshold}).` }
        : {}),
    },
  };
}
