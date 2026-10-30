/**
 * lib/server/pi-config.ts — loads the Pi harness configuration from files.
 *
 * Configuration is file-based, in Pi's style: settings,
 * the per-subject manifest, prompt
 * templates and context files all live under `lib/server/pi/` and are read
 * at runtime — never hard-coded, never bundled into client code.
 *
 * Providers and models live in `models.json`, Pi's own native format
 * (providers → baseUrl / api / apiKey with "$ENV_VAR" interpolation /
 * models), so adding a provider is a file edit, not a code change. The
 * harness points Pi's ModelRuntime at that file; keys themselves always
 * come from server environment variables, never from committed values.
 *
 * Config directory: `PI_CONFIG_DIR` env var, else `<cwd>/lib/server/pi`.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AgentId } from "./registry";
import { Modal } from "@heroui/react";

interface PiSettings {
  defaultProvider: string;
  thinkingLevel: string;
  confidenceThreshold: number;
  maxStepsPerSheet: number;
  tokenBudgetPerSheet: number;
  maxRetries: number;
}

/** One model entry in models.json (Pi's native models format). */
interface PiModelDef {
  id: string;
  name?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow?: number;
  maxTokens?: number;
}

/** One provider entry in models.json (Pi's native models format). */
export interface PiProviderDef {
  name?: string;
  baseUrl: string;
  api: string;
  /** Literal key (never commit one), "$ENV_VAR" interpolation, or absent for keyless local providers. */
  apiKey?: string;
  models: PiModelDef[];
}

export interface SubjectManifest {
  displaySubjects: string[];
  provider: string;
  /** Provider to use once this subject becomes active. */
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
  /** Providers from models.json, keyed by provider id. */
  providers: Record<string, PiProviderDef>;
  /** Absolute path of models.json (the harness hands a copy to Pi's ModelRuntime). */
  modelsPath: string;
}

let cached: PiConfig | null = null;

export function loadPiConfig(): PiConfig {
  if (cached) return cached;
  const configDir = process.env.PI_CONFIG_DIR ?? path.join(process.cwd(), "lib", "server", "pi");
  const settings = JSON.parse(readFileSync(path.join(configDir, "settings.json"), "utf8")) as PiSettings;
  const subjectsDoc = JSON.parse(readFileSync(path.join(configDir, "subjects.json"), "utf8")) as {
    subjects: Record<string, SubjectManifest>;
  };
  const modelsPath = path.join(configDir, "models.json");
  const modelsDoc = JSON.parse(readFileSync(modelsPath, "utf8")) as {
    providers: Record<string, PiProviderDef>;
  };
  cached = { configDir, settings, subjects: subjectsDoc.subjects, providers: modelsDoc.providers, modelsPath };
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

export function providerDef(config: PiConfig, providerId: string): PiProviderDef | null {
  return config.providers[providerId] ?? null;
}

/** Extra env names accepted for a provider's key (Meta's docs call theirs MODEL_API_KEY). */
const KEY_ENV_ALIASES: Record<string, string[]> = {
  meta: ["MODEL_API_KEY"],
  modal: ["MODAL_API_KEY", "MODAL_API_KEY"],
};

/** The env var a provider's "$ENV" apiKey points at, if any. */
export function providerKeyEnvName(def: PiProviderDef): string | null {
  return def.apiKey?.startsWith("$") ? def.apiKey.slice(1) : null;
}

/**
 * Resolve a provider's API key from the server environment: the "$ENV" var
 * named in models.json, then any alias env names. Returns null when the
 * provider is keyless by design (no apiKey field) OR when no key is set —
 * use providerKeyAvailable to tell those apart.
 */
export function resolveProviderApiKey(config: PiConfig, providerId: string): string | null {
  const def = providerDef(config, providerId);
  if (!def?.apiKey) return null;
  if (!def.apiKey.startsWith("$")) return def.apiKey;
  const primary = process.env[def.apiKey.slice(1)];
  if (primary) return primary;
  for (const alias of KEY_ENV_ALIASES[providerId] ?? []) {
    if (process.env[alias]) return process.env[alias] as string;
  }
  return null;
}

/** True when the provider can run: keyless by design, or its key is set. */
export function providerKeyAvailable(config: PiConfig, providerId: string): boolean {
  const def = providerDef(config, providerId);
  if (!def) return false;
  if (!def.apiKey) return true;
  return resolveProviderApiKey(config, providerId) !== null;
}

/**
 * The model a grading run actually uses: the subject manifest's model when
 * the chosen provider offers it, else the provider's first listed model
 * (so switching providers by env var alone still lands on a sane model).
 */
export function effectiveModel(config: PiConfig, agent: AgentId, providerId: string): string {
  if (providerId === "demo") return "demo-scripted";
  const def = providerDef(config, providerId);
  if (!def || def.models.length === 0) return subjectManifest(config, agent).model;
  const wanted = subjectManifest(config, agent).model;
  return def.models.some((m) => m.id === wanted) ? wanted : def.models[0].id;
}

/** Relative paths from the manifest that don't exist on disk. */
export function validatePiConfig(config: PiConfig): string[] {
  const missing: string[] = [];
  for (const manifest of Object.values(config.subjects)) {
    if (manifest.status !== "active") continue;
    for (const rel of [...Object.values(manifest.promptFiles), ...manifest.contextFiles]) {
      if (rel && !existsSync(path.join(config.configDir, rel))) missing.push(rel);
    }
    if (manifest.provider !== "demo" && !providerDef(config, manifest.provider)) {
      missing.push(`models.json provider "${manifest.provider}"`);
    }
  }
  return missing;
}

/** Read one configured prompt template for the harness. */
export function loadPrompt(config: PiConfig, agent: AgentId, kind: keyof SubjectManifest["promptFiles"]): string {
  const rel = subjectManifest(config, agent).promptFiles[kind];
  if (!rel) throw new Error(`No "${kind}" prompt configured for agent "${agent}"`);
  return readFileSync(path.join(config.configDir, rel), "utf8");
}
