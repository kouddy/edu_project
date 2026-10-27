import { promises as fs } from "node:fs";
import path from "node:path";
import type { Sheet } from "./product-types";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Server-owned sheet catalog. This is the single source of truth for
 * worksheets and answer keys: POST /api/grade reads the key from here, and
 * browsers sync read-only copies via GET /api/sheets. Sheet codes must be
 * unique (case-insensitively).
 */
export async function loadSheets(): Promise<Sheet[]> {
  const file = path.join(DATA_DIR, "sheets.json");
  const sheets = await readJson<Sheet[]>(file, []);
  return sheets;
}

/** Case-insensitive lookup: the upload form submits the code as typed. */
export async function getSheet(sheetCode: string): Promise<Sheet | null> {
  const sheets = await loadSheets();
  const want = sheetCode.trim().toLowerCase();
  return sheets.find((s) => s.sheetCode.toLowerCase() === want) ?? null;
}
