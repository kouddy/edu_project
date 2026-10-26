import { promises as fs } from "node:fs";
import path from "node:path";
import type { Attempt, ReviewItem, Sheet } from "./types";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");

export function dataDir() {
  return DATA_DIR;
}

export function uploadDir() {
  return UPLOAD_DIR;
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown) {
  await ensureDirs();
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function loadSheets(): Promise<Sheet[]> {
  const file = path.join(DATA_DIR, "sheets.json");
  const sheets = await readJson<Sheet[]>(file, []);
  return sheets;
}

export async function getSheet(id: string): Promise<Sheet | null> {
  const sheets = await loadSheets();
  return sheets.find((s) => s.id === id) ?? null;
}

export async function loadAttempts(): Promise<Attempt[]> {
  await ensureDirs();
  return readJson<Attempt[]>(path.join(DATA_DIR, "attempts.json"), []);
}

export async function saveAttempt(attempt: Attempt) {
  const attempts = await loadAttempts();
  attempts.unshift(attempt);
  await writeJson(path.join(DATA_DIR, "attempts.json"), attempts);
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  const attempts = await loadAttempts();
  return attempts.find((a) => a.id === id) ?? null;
}

export async function loadReviews(): Promise<ReviewItem[]> {
  await ensureDirs();
  return readJson<ReviewItem[]>(path.join(DATA_DIR, "reviews.json"), []);
}

export async function addReviews(items: ReviewItem[]) {
  const existing = await loadReviews();
  await writeJson(path.join(DATA_DIR, "reviews.json"), [...items, ...existing]);
}

export async function markReviewDone(id: string, done: boolean) {
  const existing = await loadReviews();
  const next = existing.map((r) => (r.id === id ? { ...r, done } : r));
  await writeJson(path.join(DATA_DIR, "reviews.json"), next);
}

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
