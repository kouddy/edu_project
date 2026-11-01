/**
 * lib/server/pi-guidance.ts — the guidance-animation agent.
 *
 * A sibling of the grading harness (lib/server/pi-harness.ts): one
 * ephemeral Pi session per question, built the same way — built-in
 * tools suppressed, only our schema-typed tools. The animation
 * contract reaches the agent as the guidance-animation skill
 * (lib/server/pi/skills/guidance-animation/): the loader registers
 * it, and the task invokes it, so the harness expands the skill
 * body into the session. Where the grading agent looks at a
 * photo and submits verdicts, this agent writes an animated lesson
 * and reviews its own draft before submitting: render_preview runs
 * the draft (the skill's scripts/guidance-verify.ts) and hands back what a
 * child stepping through it would see — the per-step text trace, the
 * end state, any script errors or shapes outside the picture — so
 * the agent can fix what code review alone cannot catch, like a hand
 * rotated around the wrong centre or a counter that runs past its
 * total. submit_animation runs the deterministic gate; an artefact
 * is captured only when the gate passes, and the caller re-runs the
 * gate before caching regardless.
 */

import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  loadSkillsFromDir,
  SessionManager,
  SettingsManager,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import path from "node:path";
import { Type } from "typebox";
import {
  effectiveModel,
  loadPiConfig,
  providerKeyAvailable,
  resolveProviderApiKey,
  subjectManifest,
} from "./pi-config";
import {
  inspectAnimation,
  verifyAnimation,
} from "./pi/skills/guidance-animation/scripts/guidance-verify";
import { createModelRuntime } from "./pi-harness";

const GUIDANCE_TIMEOUT_MS = 240_000;

export async function generateGuidanceWithHarness(args: {
  questionPrompt: string;
  correctAnswer: string;
  /** A previous attempt's failure, fed back so the agent fixes it. */
  failureNote?: string;
  /** Label for the diagnostic log lines. */
  tag?: string;
}): Promise<string> {
  const config = loadPiConfig();
  const manifest = subjectManifest(config, "guidance");
  const providerId =
    process.env.GUIDANCE_PROVIDER ?? manifest.provider ?? config.settings.defaultProvider;
  // The session's contract is the guidance-animation skill. Fail the
  // task loudly when it is missing rather than sending the agent in
  // without it — an unexpanded /skill: invocation passes through as
  // plain text and the quality loss would be silent.
  const { skills } = loadSkillsFromDir({
    dir: path.join(config.configDir, "skills"),
    source: "practice-sheets",
  });
  if (!skills.some((s) => s.name === "guidance-animation")) {
    throw new Error("The guidance-animation skill is missing from lib/server/pi/skills.");
  }
  if (!providerKeyAvailable(config, providerId)) {
    throw new Error(
      `Guidance provider "${providerId}" is not available — its API key is not set on the server.`,
    );
  }
  // GUIDANCE_MODEL overrides the manifest's model, so the guidance
  // model can be switched from .env like the provider, without
  // editing subjects.json. An id the provider doesn't define fails
  // at the getModel check below, naming the bad value.
  const modelId = process.env.GUIDANCE_MODEL ?? effectiveModel(config, "guidance", providerId);
  const apiKey = resolveProviderApiKey(config, providerId);
  const runtime = await createModelRuntime(config, providerId, apiKey);
  const model = runtime.getModel(providerId, modelId);
  if (!model) {
    throw new Error(`Model ${providerId}/${modelId} is not defined in lib/server/pi/models.json.`);
  }

  const captured: { html: string | null; submitFailures: number } = {
    html: null,
    submitFailures: 0,
  };

  const renderPreview = defineTool({
    name: "render_preview",
    label: "Preview the animation",
    description:
      "Run a draft animation and report what a child stepping through it sees: per-step visible text, the end state, script errors, contract violations, and any SVG shapes that end up outside the picture.",
    parameters: Type.Object({
      html: Type.String({ description: "The complete HTML document to preview." }),
    }),
    execute: async (_id, params) => {
      const seen = await inspectAnimation(params.html);
      const report = {
        lint: seen.lint,
        scriptErrors: seen.errors,
        stepsTaken: seen.stepsTaken,
        steppingFinished: seen.terminated,
        finalAnswerShown: seen.finalText,
        shapesOutsidePicture: seen.geometry,
        whatTheChildSees: seen.stepTexts,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(report, null, 1) }],
        details: {},
      };
    },
  });

  const submitAnimation = defineTool({
    name: "submit_animation",
    label: "Submit the animation",
    description:
      "Submit the finished animation. It must pass verification (self-contained, step control finishes, final answer matches the key, shapes inside the picture); a rejection explains what to fix.",
    parameters: Type.Object({
      html: Type.String({ description: "The complete HTML document to submit." }),
    }),
    execute: async (_id, params) => {
      const verdict = await verifyAnimation(params.html, args.correctAnswer);
      if (!verdict.ok) {
        captured.submitFailures += 1;
        return {
          content: [
            {
              type: "text" as const,
              text: `Rejected: ${verdict.detail} Preview the fixed draft, then submit again.`,
            },
          ],
          details: {},
        };
      }
      captured.html = params.html;
      return {
        content: [{ type: "text" as const, text: "Accepted and recorded. Stop here." }],
        details: {},
      };
    },
  });

  const systemPrompt =
    "You are the guidance agent of a children's practice-sheet service. You make one animated lesson for one question a child got wrong, reviewing your own draft with render_preview before you submit it. The task arrives with the guidance-animation skill, which carries the contract your lesson must satisfy.";

  const resourceLoader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills, diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };

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
    customTools: [renderPreview, submitAnimation],
  });

  const tag = args.tag ?? "guidance";
  const startedAt = Date.now();
  const log = (line: string) =>
    console.log(`[pi ${tag} +${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${line}`);
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      log(`tool start ${event.toolName}`);
    } else if (event.type === "tool_execution_end") {
      log(`tool end ${event.toolName}${event.isError ? " ERROR" : ""}`);
    } else if (event.type === "message_start") {
      if (event.message.role === "assistant") log("model call started");
    } else if (event.type === "message_end") {
      if (event.message.role === "assistant") {
        const msg = event.message;
        const usage = msg.usage ? `, tokens in ${msg.usage.input} / out ${msg.usage.output}` : "";
        log(`model call done — stop: ${msg.stopReason}${usage}${msg.errorMessage ? ` — error: ${msg.errorMessage}` : ""}`);
      }
    } else if (event.type === "auto_retry_start") {
      log(`provider retry ${event.attempt}/${event.maxAttempts} after: ${event.errorMessage}`);
    }
  });

  try {
    const task = [
      // The /skill: invocation makes the harness inline the skill
      // body ahead of the task — the agent works from the skill.
      `/skill:guidance-animation Question: ${args.questionPrompt}`,
      `Correct answer: ${args.correctAnswer}`,
      ...(args.failureNote
        ? [`A previous attempt at this lesson failed verification: ${args.failureNote}. Fix exactly that.`]
        : []),
      "Draft the animation, preview it with render_preview, fix what the preview shows, and submit the finished lesson with submit_animation.",
    ].join("\n");
    log(`guidance generation started — ${providerId}/${modelId}`);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        session.prompt(task),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Guidance generation timed out.")), GUIDANCE_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      await session.abort().catch(() => {});
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    log("guidance generation finished");
  } finally {
    unsubscribe();
    session.dispose();
  }

  if (!captured.html) {
    throw new Error("The guidance agent finished without an animation that passed verification.");
  }
  return captured.html;
}
