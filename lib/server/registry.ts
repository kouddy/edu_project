/**
 * lib/server/registry.ts — the server-side answer-key registry.
 *
 * The server is the source of truth for answer keys: printed code → sheet
 * and the versioned key. The client never sends keys with its photos
 * (see lib/grade-contract.ts).
 *
 * The registry is exactly the frozen book catalogues
 * (lib/server/book-catalogue.ts): every printed sheet in the books, with
 * its key. This module is imported ONLY by server code (route handlers
 * and lib/server/*) so keys stay out of the client flow. Later the
 * registry moves to a database; the lookup functions are the seam.
 */

import type { AnswerKeyQuestion } from "../store";
import { BOOK_REGISTRY } from "./book-catalogue";

export type AgentId = "math" | "english";

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

export const REGISTRY: RegistryEntry[] = BOOK_REGISTRY;

/**
 * "Grade 4 · Math · Week 40" — the display label for an identified
 * sheet (progress lines, summaries). The one server-side
 * implementation; mirrors lib/store.ts's sheetLabel for local records.
 */
export function sheetLabelForEntry(entry: RegistryEntry): string {
  const base = entry.setName
    ? `${entry.subject} · ${entry.setName}`
    : `${entry.subject} · Week ${entry.week}`;
  return `${entry.kidName} · ${base}`;
}

export function findByPrintedCode(code: string): RegistryEntry | null {
  return REGISTRY.find((e) => e.printedCode === code) ?? null;
}

export function findBySheetId(sheetId: string): RegistryEntry | null {
  return REGISTRY.find((e) => e.sheetId === sheetId) ?? null;
}
