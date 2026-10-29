/**
 * lib/store.ts — the single data layer for the practice-sheets app.
 *
 * ALL data access goes through this module. UI code must never touch
 * localStorage or IndexedDB directly, so this implementation can be swapped
 * for Supabase later without changing any page code.
 *
 * Storage (local-first phase):
 * - Records (parents, kids, sheets, answer keys, submissions, grade results,
 *   check resolutions) live in localStorage as one versioned JSON document.
 * - Photos live in IndexedDB — they are too big for localStorage. Submissions
 *   reference photos by opaque `photoKeys`.
 *
 * Hard rules honoured here (see README.md, Product rules):
 * - Grading never guesses: a GradeResult question is `correct`, `wrong`, or
 *   `unsure`. Anything the grader could not read confidently is `unsure` and
 *   waits for a parent CheckResolution; the score helpers below never count an
 *   unresolved `unsure` as correct or wrong.
 */

import { SEED_ANSWER_KEYS, SEED_KIDS, SEED_PARENT, SEED_SHEETS } from "./seed";

/* ------------------------------------------------------------------ types */

export interface Parent {
  id: string;
  name: string;
}

export interface Kid {
  id: string;
  parentId: string;
  name: string;
  /** School grade, 1–6. */
  grade: number;
  /** Launch subject track, e.g. "Math". */
  subject: string;
}

/** "Grade 4 · Math" — how a kid's track is labelled for parents. */
export function kidTrackLabel(kid: Kid): string {
  return `Grade ${kid.grade} · ${kid.subject}`;
}

export interface Sheet {
  id: string;
  kidId: string;
  subject: string;
  week: number;
  /** Extra sets that aren't a weekly packet, e.g. "Set B", "Set C". */
  setName?: string;
  /** The code printed on the paper sheet, e.g. "G4-MATH-W12-A". */
  printedCode: string;
  /** What this sheet practises, e.g. "Mixed practice: addition, …". */
  topic: string;
}

/** "Math · Week 12" / "Word Problems · Set B" — the parent-facing sheet name. */
export function sheetLabel(sheet: Sheet): string {
  return sheet.setName ? `${sheet.subject} · ${sheet.setName}` : `${sheet.subject} · Week ${sheet.week}`;
}

export interface AnswerKeyQuestion {
  number: number;
  prompt: string;
  correctAnswer: string;
  /** Short, kind, kid-friendly explanation, shown when the answer is wrong. */
  explanation: string;
  topic: string;
  /** True when this question is spaced review of older material. */
  isReview: boolean;
}

export interface AnswerKey {
  sheetId: string;
  questions: AnswerKeyQuestion[];
}

export type SubmissionStatus = "uploaded" | "graded" | "rejected" | "failed";

export interface Submission {
  id: string;
  sheetId: string;
  /** Keys into the IndexedDB photo store (see savePhoto/getPhoto below). */
  photoKeys: string[];
  status: SubmissionStatus;
  /** ISO timestamp, set when the submission is created. */
  createdAt: string;
  /** ISO timestamp, set when grading completes. */
  gradedAt?: string;
}

export type Verdict = "correct" | "wrong" | "unsure";

/** Subject-specific extras a grader can attach to a question (Stage 3). */
export interface QuestionGradeMeta {
  /** The question's topic, from the answer key. */
  topic?: string;
  /** For wrong answers: the categorized cause (see the lib/server/pi taxonomy). */
  errorCategory?: string;
  /** For wrong answers: generated guidance for the student. */
  guidance?: string;
}

export interface QuestionGrade {
  questionNumber: number;
  verdict: Verdict;
  /** Grader confidence, 0–1. Below-threshold reads must be `unsure`. */
  confidence: number;
  /** What the child actually wrote, or null if nothing could be read. */
  readAnswer: string | null;
  /** Optional subject metadata from the grading harness (Stage 3). */
  meta?: QuestionGradeMeta;
}

export interface GradeResult {
  id: string;
  submissionId: string;
  sheetId: string;
  perQuestion: QuestionGrade[];
  /** ISO timestamp when grading completed. */
  gradedAt: string;
}

/** A parent's ruling on an `unsure` question: the final word on that answer. */
export interface CheckResolution {
  id: string;
  gradeResultId: string;
  questionNumber: number;
  resolution: "correct" | "wrong";
  /** ISO timestamp when the parent resolved it. */
  resolvedAt: string;
}

/* ------------------------------------------------------------- db document */

interface Db {
  version: 2;
  parents: Parent[];
  kids: Kid[];
  sheets: Sheet[];
  answerKeys: AnswerKey[];
  submissions: Submission[];
  gradeResults: GradeResult[];
  checkResolutions: CheckResolution[];
}

const DB_KEY = "practice-sheets:db:v2";

const EMPTY_DB: Db = {
  version: 2,
  parents: [],
  kids: [],
  sheets: [],
  answerKeys: [],
  submissions: [],
  gradeResults: [],
  checkResolutions: [],
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readDb(): Db {
  if (!isBrowser()) return structuredClone(EMPTY_DB);
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (!raw) return structuredClone(EMPTY_DB);
    const parsed = JSON.parse(raw) as Db;
    if (parsed.version !== 2) return structuredClone(EMPTY_DB);
    return { ...structuredClone(EMPTY_DB), ...parsed };
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

function writeDb(db: Db): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/* ---------------------------------------------------------------- seeding */

/**
 * Load the seed data (parent, kids, sheets, answer keys) if the local
 * database is still empty. Idempotent — safe to call on every page load.
 */
export function ensureSeeded(): void {
  if (!isBrowser()) return;
  const db = readDb();
  if (db.parents.length > 0) return;
  db.parents = structuredClone([SEED_PARENT]);
  db.kids = structuredClone(SEED_KIDS);
  db.sheets = structuredClone(SEED_SHEETS);
  db.answerKeys = structuredClone(SEED_ANSWER_KEYS);
  writeDb(db);
}

/* ---------------------------------------------------------------- parents */

export function listParents(): Parent[] {
  return readDb().parents;
}

export function getParent(id: string): Parent | null {
  return readDb().parents.find((p) => p.id === id) ?? null;
}

/** The MVP is a single-account device: the signed-in parent is the first one. */
export function getCurrentParent(): Parent | null {
  return readDb().parents[0] ?? null;
}

/* ------------------------------------------------------------ device session */

/**
 * Local-first phase: there are no real accounts yet, so "signed in" is a
 * device-local flag kept next to (not inside) the data document. The
 * Supabase migration replaces this with real auth.
 */
export interface AuthState {
  signedIn: boolean;
  /** The email the parent used for the sign-in link, when they gave one. */
  email?: string;
}

const AUTH_KEY = "practice-sheets:auth:v1";

export function getAuthState(): AuthState {
  if (!isBrowser()) return { signedIn: false };
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return { signedIn: false };
    const parsed = JSON.parse(raw) as AuthState;
    return { signedIn: parsed.signedIn === true, email: parsed.email };
  } catch {
    return { signedIn: false };
  }
}

export function signIn(email?: string): void {
  if (!isBrowser()) return;
  const state: AuthState = email ? { signedIn: true, email } : { signedIn: true };
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(state));
}

export function signOut(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(AUTH_KEY);
}

export function upsertParent(parent: Parent): Parent {
  const db = readDb();
  const i = db.parents.findIndex((p) => p.id === parent.id);
  if (i >= 0) db.parents[i] = parent;
  else db.parents.push(parent);
  writeDb(db);
  return parent;
}

/* ------------------------------------------------------------------- kids */

export function listKids(parentId?: string): Kid[] {
  const kids = readDb().kids;
  return parentId ? kids.filter((k) => k.parentId === parentId) : kids;
}

export function getKid(id: string): Kid | null {
  return readDb().kids.find((k) => k.id === id) ?? null;
}

export function addKid(input: Omit<Kid, "id"> & { id?: string }): Kid {
  const kid: Kid = { ...input, id: input.id ?? newId("kid") };
  const db = readDb();
  db.kids.push(kid);
  writeDb(db);
  return kid;
}

export function updateKid(id: string, patch: Partial<Omit<Kid, "id">>): Kid | null {
  const db = readDb();
  const i = db.kids.findIndex((k) => k.id === id);
  if (i < 0) return null;
  db.kids[i] = { ...db.kids[i], ...patch };
  writeDb(db);
  return db.kids[i];
}

/* ----------------------------------------------------------------- sheets */

export function listSheets(filter?: { kidId?: string }): Sheet[] {
  const sheets = readDb().sheets;
  return filter?.kidId ? sheets.filter((s) => s.kidId === filter.kidId) : sheets;
}

export function getSheet(id: string): Sheet | null {
  return readDb().sheets.find((s) => s.id === id) ?? null;
}

/** Look a sheet up by the code printed on the paper. */
export function getSheetByCode(printedCode: string): Sheet | null {
  return readDb().sheets.find((s) => s.printedCode === printedCode) ?? null;
}

export function addSheet(input: Omit<Sheet, "id"> & { id?: string }): Sheet {
  const sheet: Sheet = { ...input, id: input.id ?? newId("sheet") };
  const db = readDb();
  db.sheets.push(sheet);
  writeDb(db);
  return sheet;
}

/* ------------------------------------------------------------- answer keys */

export function getAnswerKey(sheetId: string): AnswerKey | null {
  return readDb().answerKeys.find((k) => k.sheetId === sheetId) ?? null;
}

export function setAnswerKey(key: AnswerKey): AnswerKey {
  const db = readDb();
  const i = db.answerKeys.findIndex((k) => k.sheetId === key.sheetId);
  if (i >= 0) db.answerKeys[i] = key;
  else db.answerKeys.push(key);
  writeDb(db);
  return key;
}

/* ------------------------------------------------------------- submissions */

export function createSubmission(input: {
  sheetId: string;
  photoKeys: string[];
  status?: SubmissionStatus;
}): Submission {
  const submission: Submission = {
    id: newId("sub"),
    sheetId: input.sheetId,
    photoKeys: [...input.photoKeys],
    status: input.status ?? "uploaded",
    createdAt: nowIso(),
  };
  const db = readDb();
  db.submissions.push(submission);
  writeDb(db);
  return submission;
}

export function getSubmission(id: string): Submission | null {
  return readDb().submissions.find((s) => s.id === id) ?? null;
}

export function listSubmissions(filter?: { sheetId?: string; kidId?: string }): Submission[] {
  const db = readDb();
  let subs = db.submissions;
  if (filter?.sheetId) subs = subs.filter((s) => s.sheetId === filter.sheetId);
  if (filter?.kidId) {
    const kidSheetIds = new Set(db.sheets.filter((s) => s.kidId === filter.kidId).map((s) => s.id));
    subs = subs.filter((s) => kidSheetIds.has(s.sheetId));
  }
  return subs;
}

export function updateSubmission(
  id: string,
  patch: Partial<Omit<Submission, "id">>,
): Submission | null {
  const db = readDb();
  const i = db.submissions.findIndex((s) => s.id === id);
  if (i < 0) return null;
  db.submissions[i] = { ...db.submissions[i], ...patch };
  writeDb(db);
  return db.submissions[i];
}

/* ------------------------------------------------------------ grade results */

export function saveGradeResult(input: {
  submissionId: string;
  sheetId: string;
  perQuestion: QuestionGrade[];
}): GradeResult {
  const result: GradeResult = {
    id: newId("grade"),
    submissionId: input.submissionId,
    sheetId: input.sheetId,
    perQuestion: input.perQuestion,
    gradedAt: nowIso(),
  };
  const db = readDb();
  db.gradeResults.push(result);
  // Keep the submission in step: it is now graded.
  const sub = db.submissions.find((s) => s.id === input.submissionId);
  if (sub) {
    sub.status = "graded";
    sub.gradedAt = result.gradedAt;
  }
  writeDb(db);
  return result;
}

export function getGradeResult(id: string): GradeResult | null {
  return readDb().gradeResults.find((g) => g.id === id) ?? null;
}

export function getGradeResultForSubmission(submissionId: string): GradeResult | null {
  return readDb().gradeResults.find((g) => g.submissionId === submissionId) ?? null;
}

export function listGradeResults(filter?: { sheetId?: string }): GradeResult[] {
  const results = readDb().gradeResults;
  return filter?.sheetId ? results.filter((g) => g.sheetId === filter.sheetId) : results;
}

/* --------------------------------------------------------- check resolutions */

export function resolveCheck(input: {
  gradeResultId: string;
  questionNumber: number;
  resolution: "correct" | "wrong";
}): CheckResolution {
  const db = readDb();
  const existing = db.checkResolutions.find(
    (r) => r.gradeResultId === input.gradeResultId && r.questionNumber === input.questionNumber,
  );
  if (existing) {
    existing.resolution = input.resolution;
    existing.resolvedAt = nowIso();
    writeDb(db);
    return existing;
  }
  const resolution: CheckResolution = {
    id: newId("check"),
    gradeResultId: input.gradeResultId,
    questionNumber: input.questionNumber,
    resolution: input.resolution,
    resolvedAt: nowIso(),
  };
  db.checkResolutions.push(resolution);
  writeDb(db);
  return resolution;
}

export function listCheckResolutions(gradeResultId: string): CheckResolution[] {
  return readDb().checkResolutions.filter((r) => r.gradeResultId === gradeResultId);
}

export function getCheckResolution(
  gradeResultId: string,
  questionNumber: number,
): CheckResolution | null {
  return (
    readDb().checkResolutions.find(
      (r) => r.gradeResultId === gradeResultId && r.questionNumber === questionNumber,
    ) ?? null
  );
}

/* -------------------------------------------- bulk seeding / demo records */

/**
 * Insert records whose ids are not already present. Used to layer the demo
 * dataset (extra sheets, past submissions, …) onto the base seed without
 * duplicating anything on repeat loads.
 */
export function seedRecords(bundle: {
  sheets?: Sheet[];
  answerKeys?: AnswerKey[];
  submissions?: Submission[];
  gradeResults?: GradeResult[];
  checkResolutions?: CheckResolution[];
}): void {
  const db = readDb();
  const addMissing = <T extends { id: string }>(list: T[], items: T[] | undefined) => {
    for (const item of items ?? []) {
      if (!list.some((x) => x.id === item.id)) list.push(structuredClone(item));
    }
  };
  addMissing(db.sheets, bundle.sheets);
  for (const key of bundle.answerKeys ?? []) {
    if (!db.answerKeys.some((k) => k.sheetId === key.sheetId)) {
      db.answerKeys.push(structuredClone(key));
    }
  }
  addMissing(db.submissions, bundle.submissions);
  addMissing(db.gradeResults, bundle.gradeResults);
  addMissing(db.checkResolutions, bundle.checkResolutions);
  writeDb(db);
}

/** The most recent submission for a sheet, or null if it was never sent in. */
export function getLatestSubmissionForSheet(sheetId: string): Submission | null {
  const subs = readDb().submissions.filter((s) => s.sheetId === sheetId);
  if (subs.length === 0) return null;
  return subs.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
}

/**
 * Remove every submission, grade result and check resolution for a sheet.
 * Returns the photo keys the removed submissions referenced, so the caller
 * can delete the blobs too. The sheet and its answer key stay.
 */
export function deleteSheetRecords(sheetId: string): string[] {
  const db = readDb();
  const subs = db.submissions.filter((s) => s.sheetId === sheetId);
  const photoKeys = subs.flatMap((s) => s.photoKeys);
  const subIds = new Set(subs.map((s) => s.id));
  const resultIds = new Set(
    db.gradeResults.filter((g) => subIds.has(g.submissionId) || g.sheetId === sheetId).map((g) => g.id),
  );
  db.submissions = db.submissions.filter((s) => s.sheetId !== sheetId);
  db.gradeResults = db.gradeResults.filter((g) => !resultIds.has(g.id));
  db.checkResolutions = db.checkResolutions.filter((r) => !resultIds.has(r.gradeResultId));
  writeDb(db);
  return photoKeys;
}

/* ------------------------------------------------------------- score helper */

export interface ScoreSummary {
  total: number;
  /** Questions with a confident verdict (correct or wrong). */
  graded: number;
  correct: number;
  wrong: number;
  /** Questions still waiting for a parent check. */
  unsure: number;
  /** True once every `unsure` question has a parent resolution. */
  isFinal: boolean;
  /** Correct count counting parent resolutions; equals `correct` until final. */
  finalCorrect: number;
}

/**
 * Derive the score for a grade result. An `unsure` question counts as neither
 * correct nor wrong until the parent resolves it — the score never guesses.
 * When resolutions are supplied, resolved questions move into correct/wrong
 * and the summary becomes final once no `unsure` questions remain.
 */
export function scoreFor(
  result: GradeResult,
  resolutions: CheckResolution[] = [],
): ScoreSummary {
  const byQuestion = new Map(resolutions.map((r) => [r.questionNumber, r.resolution]));
  let correct = 0;
  let wrong = 0;
  let unsure = 0;
  for (const q of result.perQuestion) {
    if (q.verdict === "correct") correct++;
    else if (q.verdict === "wrong") wrong++;
    else {
      const resolution = byQuestion.get(q.questionNumber);
      if (resolution === "correct") correct++;
      else if (resolution === "wrong") wrong++;
      else unsure++;
    }
  }
  const total = result.perQuestion.length;
  return {
    total,
    graded: correct + wrong,
    correct,
    wrong,
    unsure,
    isFinal: unsure === 0,
    finalCorrect: correct,
  };
}

/* ------------------------------------------------------------------ photos
 * Photos live in IndexedDB ("practice-sheets-photos", store "photos").
 * savePhoto returns an opaque key; submissions store these keys.
 */

const PHOTO_DB_NAME = "practice-sheets-photos";
const PHOTO_STORE = "photos";

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(PHOTO_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PHOTO_STORE)) {
        req.result.createObjectStore(PHOTO_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePhoto(blob: Blob): Promise<string> {
  const key = newId("photo");
  const db = await openPhotoDb();
  try {
    await idbRequest(db.transaction(PHOTO_STORE, "readwrite").objectStore(PHOTO_STORE).put(blob, key));
  } finally {
    db.close();
  }
  return key;
}

export async function getPhoto(key: string): Promise<Blob | null> {
  const db = await openPhotoDb();
  try {
    const value = await idbRequest(db.transaction(PHOTO_STORE, "readonly").objectStore(PHOTO_STORE).get(key));
    return (value as Blob | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function deletePhoto(key: string): Promise<void> {
  const db = await openPhotoDb();
  try {
    await idbRequest(db.transaction(PHOTO_STORE, "readwrite").objectStore(PHOTO_STORE).delete(key));
  } finally {
    db.close();
  }
}

export async function listPhotoKeys(): Promise<string[]> {
  const db = await openPhotoDb();
  try {
    const keys = await idbRequest(
      db.transaction(PHOTO_STORE, "readonly").objectStore(PHOTO_STORE).getAllKeys(),
    );
    return keys.map(String);
  } finally {
    db.close();
  }
}
