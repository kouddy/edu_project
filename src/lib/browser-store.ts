// Browser data layer for the product model.
//
// Architecture rule: ALL product data access goes through the `Store`
// interface below. UI components import `store` (the singleton) from this
// module and never touch localStorage or IndexedDB directly — so swapping
// this file's implementation for Supabase later means touching only this
// file, not the UI.
//
// Persistence split:
// - localStorage: small JSON records (children, sheets, submissions,
//   graded results, review items). Everything is async so the interface is
//   already promise-shaped like a Supabase client.
// - IndexedDB: photo blobs, which are too big for localStorage.
//
// This module is client-safe: importing it on the server (e.g. from a
// Server Component) must not touch window/localStorage/indexedDB. All
// browser APIs are reached lazily inside methods; on the server, reads
// resolve empty and writes reject with a clear error.

import type {
  Child,
  GradedResult,
  ReviewItem,
  Sheet,
  Submission,
  SubmissionStatus,
} from "./product-types";

export type { Child, GradedResult, ReviewItem, Sheet, Submission };

export interface Store {
  // -- children --
  listChildren(): Promise<Child[]>;
  saveChild(child: Child): Promise<void>;

  // -- sheets --
  listSheets(): Promise<Sheet[]>;
  getSheet(sheetCode: string): Promise<Sheet | null>;
  saveSheet(sheet: Sheet): Promise<void>;

  // -- submissions --
  listSubmissions(childId?: string): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | null>;
  saveSubmission(submission: Submission): Promise<void>;
  setSubmissionStatus(id: string, status: SubmissionStatus): Promise<void>;

  // -- grading results --
  getGradedResult(submissionId: string): Promise<GradedResult | null>;
  saveGradedResult(result: GradedResult): Promise<void>;

  // -- spaced-review queue (identity = childId + topic + sourceSheetCode) --
  listReviewItems(childId?: string): Promise<ReviewItem[]>;
  upsertReviewItem(item: ReviewItem): Promise<void>;
  deleteReviewItem(
    childId: string,
    topic: string,
    sourceSheetCode: string
  ): Promise<void>;

  // -- photos (IndexedDB) --
  savePhoto(photoId: string, blob: Blob): Promise<void>;
  getPhoto(photoId: string): Promise<Blob | null>;
  deletePhoto(photoId: string): Promise<void>;

  /**
   * Sync the sheet library from the server catalog (GET /api/sheets).
   * Server wins on conflicts; never deletes local sheets. When the server
   * is unreachable and the library is empty, seeds the bundled sample
   * sheet instead. Idempotent.
   */
  syncSheets(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

export const SAMPLE_SHEET_CODE = "G3-MATH-TEST-A";

export const SAMPLE_SHEET: Sheet = {
  sheetCode: SAMPLE_SHEET_CODE,
  grade: 3,
  subject: "math",
  week: "week-1",
  questions: [
    { questionNumber: 1, prompt: "24 + 35", correctAnswer: "59", topic: "addition" },
    { questionNumber: 2, prompt: "87 − 29", correctAnswer: "58", topic: "subtraction" },
    { questionNumber: 3, prompt: "6 × 4", correctAnswer: "24", topic: "multiplication" },
    { questionNumber: 4, prompt: "36 ÷ 4", correctAnswer: "9", topic: "division" },
    { questionNumber: 5, prompt: "1/2 + 1/4", correctAnswer: "3/4", topic: "fractions" },
    { questionNumber: 6, prompt: "Round 264 to the nearest 10", correctAnswer: "260", topic: "rounding" },
    { questionNumber: 7, prompt: "Perimeter of a 6 by 4 rectangle", correctAnswer: "20", topic: "geometry" },
    { questionNumber: 8, prompt: "9 × 3", correctAnswer: "27", topic: "multiplication" },
    { questionNumber: 9, prompt: "Quarter past 3 is what time?", correctAnswer: "3:15", topic: "telling time" },
    {
      questionNumber: 10,
      prompt: "Maya has 5 bags with 6 apples in each bag. How many apples?",
      correctAnswer: "30",
      topic: "word problems",
    },
  ],
};

// ---------------------------------------------------------------------------
// localStorage record backend (small JSON records only)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "practice-sheets.store.v1";

interface StoreShape {
  children: Child[];
  sheets: Sheet[];
  submissions: Submission[];
  results: GradedResult[];
  reviews: ReviewItem[];
}

const EMPTY_SHAPE: StoreShape = {
  children: [],
  sheets: [],
  submissions: [],
  results: [],
  reviews: [],
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Minimal shape guard so a bad /api/sheets response never poisons the library. */
function isSheet(value: unknown): value is Sheet {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<Sheet>;
  return (
    typeof s.sheetCode === "string" &&
    s.sheetCode.length > 0 &&
    typeof s.grade === "number" &&
    typeof s.subject === "string" &&
    typeof s.week === "string" &&
    Array.isArray(s.questions) &&
    s.questions.every(
      (q) =>
        typeof q === "object" &&
        q !== null &&
        typeof (q as { questionNumber?: unknown }).questionNumber === "number" &&
        typeof (q as { prompt?: unknown }).prompt === "string" &&
        typeof (q as { correctAnswer?: unknown }).correctAnswer === "string" &&
        typeof (q as { topic?: unknown }).topic === "string"
    )
  );
}

function readAll(): StoreShape {
  if (!isBrowser()) return { ...EMPTY_SHAPE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_SHAPE };
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      children: Array.isArray(parsed.children) ? parsed.children : [],
      sheets: Array.isArray(parsed.sheets) ? parsed.sheets : [],
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
      results: Array.isArray(parsed.results) ? parsed.results : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
    };
  } catch {
    return { ...EMPTY_SHAPE };
  }
}

function writeAll(shape: StoreShape): void {
  if (!isBrowser()) throw new Error("Store writes require a browser (localStorage).");
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
}

// ---------------------------------------------------------------------------
// IndexedDB photo backend (binary blobs only)
// ---------------------------------------------------------------------------

const PHOTO_DB = "practice-sheets-photos";
const PHOTO_STORE = "photos";

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const req = indexedDB.open(PHOTO_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PHOTO_STORE)) {
        req.result.createObjectStore(PHOTO_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open photo database."));
  });
}

async function idbPut(photoId: string, blob: Blob): Promise<void> {
  const db = await openPhotoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Photo save failed."));
      tx.objectStore(PHOTO_STORE).put(blob, photoId);
    });
  } finally {
    db.close();
  }
}

async function idbGet(photoId: string): Promise<Blob | null> {
  const db = await openPhotoDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const req = tx.objectStore(PHOTO_STORE).get(photoId);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error("Photo read failed."));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(photoId: string): Promise<void> {
  const db = await openPhotoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Photo delete failed."));
      tx.objectStore(PHOTO_STORE).delete(photoId);
    });
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Browser implementation
// ---------------------------------------------------------------------------

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class BrowserStore implements Store {
  async listChildren(): Promise<Child[]> {
    return readAll().children;
  }

  async saveChild(child: Child): Promise<void> {
    const all = readAll();
    const i = all.children.findIndex((c) => c.id === child.id);
    if (i >= 0) all.children[i] = child;
    else all.children.push(child);
    writeAll(all);
  }

  async listSheets(): Promise<Sheet[]> {
    return readAll().sheets;
  }

  async getSheet(sheetCode: string): Promise<Sheet | null> {
    // Case-insensitive like the server: submissions keep the code as typed.
    const want = sheetCode.trim().toLowerCase();
    return (
      readAll().sheets.find((s) => s.sheetCode.toLowerCase() === want) ?? null
    );
  }

  async saveSheet(sheet: Sheet): Promise<void> {
    const all = readAll();
    const i = all.sheets.findIndex((s) => s.sheetCode === sheet.sheetCode);
    if (i >= 0) all.sheets[i] = sheet;
    else all.sheets.push(sheet);
    writeAll(all);
  }

  async listSubmissions(childId?: string): Promise<Submission[]> {
    const all = readAll().submissions;
    return childId ? all.filter((s) => s.childId === childId) : all;
  }

  async getSubmission(id: string): Promise<Submission | null> {
    return readAll().submissions.find((s) => s.id === id) ?? null;
  }

  async saveSubmission(submission: Submission): Promise<void> {
    const all = readAll();
    const i = all.submissions.findIndex((s) => s.id === submission.id);
    if (i >= 0) all.submissions[i] = submission;
    else all.submissions.unshift(submission);
    writeAll(all);
  }

  async setSubmissionStatus(id: string, status: SubmissionStatus): Promise<void> {
    const all = readAll();
    const found = all.submissions.find((s) => s.id === id);
    if (!found) throw new Error(`Unknown submission: ${id}`);
    found.status = status;
    writeAll(all);
  }

  async getGradedResult(submissionId: string): Promise<GradedResult | null> {
    return readAll().results.find((r) => r.submissionId === submissionId) ?? null;
  }

  async saveGradedResult(result: GradedResult): Promise<void> {
    const all = readAll();
    const i = all.results.findIndex((r) => r.submissionId === result.submissionId);
    if (i >= 0) all.results[i] = result;
    else all.results.push(result);
    writeAll(all);
  }

  async listReviewItems(childId?: string): Promise<ReviewItem[]> {
    const all = readAll().reviews;
    return childId ? all.filter((r) => r.childId === childId) : all;
  }

  async upsertReviewItem(item: ReviewItem): Promise<void> {
    const all = readAll();
    const i = all.reviews.findIndex(
      (r) =>
        r.childId === item.childId &&
        r.topic === item.topic &&
        r.sourceSheetCode === item.sourceSheetCode
    );
    if (i >= 0) all.reviews[i] = item;
    else all.reviews.push(item);
    writeAll(all);
  }

  async deleteReviewItem(
    childId: string,
    topic: string,
    sourceSheetCode: string
  ): Promise<void> {
    const all = readAll();
    all.reviews = all.reviews.filter(
      (r) =>
        !(
          r.childId === childId &&
          r.topic === topic &&
          r.sourceSheetCode === sourceSheetCode
        )
    );
    writeAll(all);
  }

  async savePhoto(photoId: string, blob: Blob): Promise<void> {
    await idbPut(photoId, blob);
  }

  async getPhoto(photoId: string): Promise<Blob | null> {
    return idbGet(photoId);
  }

  async deletePhoto(photoId: string): Promise<void> {
    await idbDelete(photoId);
  }

  async syncSheets(): Promise<void> {
    if (!isBrowser()) return;
    try {
      const res = await fetch("/api/sheets");
      if (!res.ok) throw new Error(`Sheet sync failed: ${res.status}`);
      const data = (await res.json()) as { sheets?: unknown };
      const sheets = Array.isArray(data.sheets) ? data.sheets : [];
      for (const sheet of sheets) {
        if (isSheet(sheet)) await this.saveSheet(sheet);
      }
      if (sheets.length === 0 && (await this.listSheets()).length === 0) {
        await this.saveSheet(SAMPLE_SHEET);
      }
    } catch {
      if ((await this.listSheets()).length === 0) {
        await this.saveSheet(SAMPLE_SHEET);
      }
    }
  }
}

/**
 * The app-wide store singleton. Components import this — never
 * localStorage / indexedDB directly. To move to Supabase: write a
 * `SupabaseStore implements Store` and swap this export.
 */
export const store: Store = new BrowserStore();
