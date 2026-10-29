/**
 * lib/server/pi-config.ts — loads the Pi harness configuration from files.
 *
 * The Stage 3 design leans on Pi's file-based configuration (see
 * docs/stage-3-design.md): settings, the per-subject manifest, prompt
 * templates and context files all live under `server/pi/` and are read at
 * runtime — never hard-coded, never bundled into client code. The Pi
 * session runtime arrives in Phase 2 and consumes this same config through
 * an explicit resource loader; Phase 1 loads and validates it so a broken
 * config fails a grading job loudly instead of grading badly.
 *
 * Config directory: `PI_CONFIG_DIR` env var, else `<cwd>/server/pi`.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AgentId } from "./registry";

export interface PiSettings {
  defaultProvider: string;
  thinkingLevel: string;
  confidenceThreshold: number;
  maxStepsPerSheet: number;
  tokenBudgetPerSheet: number;
  maxRetries: number;
}

export interface SubjectManifest {
  displaySubjects: string[];
  provider: string;
  /** Provider planned once real model calls land (Phase 2). */
  plannedProvider?: string;
  model: string;
  schemaVersion: string;
  status: "active" | "planned";
  promptFiles: Partial<Record<"identify" | "grade" | "errorAnalysis" | "guidance", string>>;
  contextFiles: string[];
  maxSteps: number;
  tokenBudget: number;
}

export interface PiConfig {
  configDir: string;
  settings: PiSettings;
  subjects: Record<string, SubjectManifest>;
}

let cached: PiConfig | null = null;

export function loadPiConfig(): PiConfig {
  if (cached) return cached;
  const configDir = process.env.PI_CONFIG_DIR ?? path.join(process.cwd(), "server", "pi");
  const settings = JSON.parse(readFileSync(path.join(configDir, "settings.json"), "utf8")) as PiSettings;
  const subjectsDoc = JSON.parse(readFileSync(path.join(configDir, "subjects.json"), "utf8")) as {
    subjects: Record<string, SubjectManifest>;
  };
  cached = { configDir, settings, subjects: subjectsDoc.subjects };
  return cached;
}

export function subjectManifest(config: PiConfig, agent: AgentId): SubjectManifest {
  const manifest = config.subjects[agent];
  if (!manifest) throw new Error(`No Pi subject manifest for agent "${agent}"`);
  return manifest;
}

/**
 * Which provider grades this agent right now: the GRADING_PROVIDER env var
 * wins, then the subject manifest, then the global default.
 */
export function providerForAgent(config: PiConfig, agent: AgentId): string {
  return process.env.GRADING_PROVIDER ?? subjectManifest(config, agent).provider ?? config.settings.defaultProvider;
}

/** Relative paths from the manifest that don't exist on disk. */
export function validatePiConfig(config: PiConfig): string[] {
  const missing: string[] = [];
  for (const manifest of Object.values(config.subjects)) {
    if (manifest.status !== "active") continue;
    for (const rel of [...Object.values(manifest.promptFiles), ...manifest.contextFiles]) {
      if (rel && !existsSync(path.join(config.configDir, rel))) missing.push(rel);
    }
  }
  return missing;
}

/** Read one configured prompt template (Phase 2 harness input). */
export function loadPrompt(config: PiConfig, agent: AgentId, kind: keyof SubjectManifest["promptFiles"]): string {
  const rel = subjectManifest(config, agent).promptFiles[kind];
  if (!rel) throw new Error(`No "${kind}" prompt configured for agent "${agent}"`);
  return readFileSync(path.join(config.configDir, rel), "utf8");
}
