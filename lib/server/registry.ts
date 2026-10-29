/**
 * lib/server/registry.ts — the server-side answer-key registry.
 *
 * The server is the source of truth for answer keys: printed code → sheet,
 * assigned kid, and the versioned key. The client never sends keys with its
 * photos (see lib/grade-contract.ts).
 *
 * Phase 1 seeds the registry from the same data the local-first demo uses
 * (lib/seed.ts), but this module is imported ONLY by server code (route
 * handlers and lib/server/*) so keys stay out of the client flow. Later the
 * registry moves to a database; the lookup functions are the seam.
 */

import { SEED_ANSWER_KEYS, SEED_KIDS, SEED_SHEETS } from "../seed";
import type { AnswerKeyQuestion } from "../store";

export type AgentId = "math" | "english";

const AGENT_BY_SUBJECT: Record<string, AgentId> = {
  Math: "math",
  "Word Problems": "math",
  English: "english",
};

/** Registry key version for every seeded sheet. Bump when a key changes. */
export const SEEDED_KEY_VERSION = 1;

export interface RegistryEntry {
  printedCode: string;
  sheetId: string;
  kidId: string;
  kidName: string;
  kidGrade: number;
  subject: string;
  agent: AgentId;
  week: number;
  setName?: string;
  topic: string;
  keyVersion: number;
  /** The answer key. Empty when no key is registered for this sheet yet. */
  questions: AnswerKeyQuestion[];
}

function buildRegistry(): RegistryEntry[] {
  const kidById = new Map(SEED_KIDS.map((k) => [k.id, k]));
  const keyBySheetId = new Map(SEED_ANSWER_KEYS.map((k) => [k.sheetId, k]));
  return SEED_SHEETS.map((sheet) => {
    const kid = kidById.get(sheet.kidId);
    const key = keyBySheetId.get(sheet.id);
    return {
      printedCode: sheet.printedCode,
      sheetId: sheet.id,
      kidId: sheet.kidId,
      kidName: kid?.name ?? "",
      kidGrade: kid?.grade ?? 0,
      subject: sheet.subject,
      agent: AGENT_BY_SUBJECT[sheet.subject] ?? "math",
      week: sheet.week,
      setName: sheet.setName,
      topic: sheet.topic,
      keyVersion: SEEDED_KEY_VERSION,
      questions: key?.questions ?? [],
    };
  });
}

export const REGISTRY: RegistryEntry[] = buildRegistry();

export function findByPrintedCode(code: string): RegistryEntry | null {
  return REGISTRY.find((e) => e.printedCode === code) ?? null;
}

export function findBySheetId(sheetId: string): RegistryEntry | null {
  return REGISTRY.find((e) => e.sheetId === sheetId) ?? null;
}
