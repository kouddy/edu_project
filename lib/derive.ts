/**
 * lib/derive.ts — read-side helpers: one snapshot of everything the UI
 * needs, plus the derived state the screens share (homework rows, history,
 * pending checks, the status slot, streaks).
 *
 * Everything here reads through lib/store.ts only.
 */

import {
  getAnswerKey,
  getCurrentParent,
  getGradeResultForSubmission,
  getLatestSubmissionForSheet,
  kidTrackLabel,
  listCheckResolutions,
  listKids,
  listSheets,
  scoreFor,
  sheetLabel,
  type AnswerKey,
  type CheckResolution,
  type GradeResult,
  type Kid,
  type Parent,
  type ScoreSummary,
  type Sheet,
  type Submission,
} from "./store";
import { ensureDemoData } from "./demo";

export { kidTrackLabel, sheetLabel };

export interface SheetState {
  sheet: Sheet;
  kid: Kid;
  key: AnswerKey | null;
  submission: Submission | null;
  result: GradeResult | null;
  resolutions: CheckResolution[];
  score: ScoreSummary | null;
}

export interface Snapshot {
  parent: Parent | null;
  kids: Kid[];
  /** Every sheet, keyed by sheet id, with its latest grading state. */
  states: Map<string, SheetState>;
}

export function loadSnapshot(): Snapshot {
  ensureDemoData();
  const parent = getCurrentParent();
  const kids = parent ? listKids(parent.id) : [];
  const kidById = new Map(kids.map((k) => [k.id, k]));
  const states = new Map<string, SheetState>();
  for (const sheet of listSheets()) {
    const kid = kidById.get(sheet.kidId);
    if (!kid) continue;
    const submission = getLatestSubmissionForSheet(sheet.id);
    const result = submission ? getGradeResultForSubmission(submission.id) : null;
    const resolutions = result ? listCheckResolutions(result.id) : [];
    states.set(sheet.id, {
      sheet,
      kid,
      key: getAnswerKey(sheet.id),
      submission,
      result,
      resolutions,
      score: result ? scoreFor(result, resolutions) : null,
    });
  }
  return { parent, kids, states };
}

/* ------------------------------------------------------------ per-kid views */

export function currentWeek(snap: Snapshot, kid: Kid): number {
  let max = 0;
  for (const st of snap.states.values()) {
    if (st.kid.id === kid.id) max = Math.max(max, st.sheet.week);
  }
  return max;
}

/** This week's assigned sheets (the Homework list): weekly packets only. */
export function homeworkStates(snap: Snapshot, kid: Kid): SheetState[] {
  const week = currentWeek(snap, kid);
  return [...snap.states.values()]
    .filter((st) => st.kid.id === kid.id && st.sheet.week === week && !st.sheet.setName)
    .sort((a, b) => sheetLabel(a.sheet).localeCompare(sheetLabel(b.sheet)));
}

export function isDone(st: SheetState): boolean {
  return !!st.score?.isFinal;
}

export function kidWeekDone(snap: Snapshot, kid: Kid): boolean {
  const rows = homeworkStates(snap, kid);
  return rows.length > 0 && rows.every(isDone);
}

/**
 * History: finished records only — final results that are not part of this
 * week's homework. The live Week 12 sheet never appears here, so nothing in
 * History can change. (Math · Set C lands here once scanned in, already
 * final.)
 */
export function historyStates(snap: Snapshot, kid: Kid): SheetState[] {
  const homeworkIds = new Set(homeworkStates(snap, kid).map((st) => st.sheet.id));
  return [...snap.states.values()]
    .filter(
      (st) =>
        st.kid.id === kid.id && st.score?.isFinal && !homeworkIds.has(st.sheet.id),
    )
    .sort((a, b) => (b.result?.gradedAt ?? "").localeCompare(a.result?.gradedAt ?? ""));
}

export function kidHasGradedSheet(snap: Snapshot, kid: Kid): boolean {
  return [...snap.states.values()].some((st) => st.kid.id === kid.id && st.result);
}

/** Weekly streak: Gina's seeded run is 6, +1 once this week is finished. */
const STREAK_BASE: Record<string, number> = { "kid-gina": 6 };
export function streakFor(snap: Snapshot, kid: Kid): number {
  return (STREAK_BASE[kid.id] ?? 0) + (kidWeekDone(snap, kid) ? 1 : 0);
}

/** Share of month-old review questions still answered correctly. */
export function reviewRetentionText(snap: Snapshot, kid: Kid): string | null {
  if (!kidHasGradedSheet(snap, kid)) return null;
  return kid.id === "kid-gina" ? "8/10 still correct" : null;
}

/* ----------------------------------------------------------- pending checks */

export interface CheckItem {
  gradeResultId: string;
  sheet: Sheet;
  kid: Kid;
  questionNumber: number;
  prompt: string;
  correctAnswer: string;
  readAnswer: string | null;
}

/** Every unanswered "unsure" across all kids — one consolidated queue. */
export function pendingChecks(snap: Snapshot): CheckItem[] {
  const items: CheckItem[] = [];
  for (const st of snap.states.values()) {
    if (!st.result || !st.key) continue;
    const resolved = new Set(st.resolutions.map((r) => r.questionNumber));
    for (const g of st.result.perQuestion) {
      if (g.verdict !== "unsure" || resolved.has(g.questionNumber)) continue;
      const q = st.key.questions.find((x) => x.number === g.questionNumber);
      items.push({
        gradeResultId: st.result.id,
        sheet: st.sheet,
        kid: st.kid,
        questionNumber: g.questionNumber,
        prompt: q?.prompt ?? `Question ${g.questionNumber}`,
        correctAnswer: q?.correctAnswer ?? "",
        readAnswer: g.readAnswer,
      });
    }
  }
  return items;
}

/* -------------------------------------------------------------- status slot */

export type StatusSlot =
  | { type: "check"; count: number; label: string }
  | { type: "caughtup" }
  | null;

export function statusSlot(snap: Snapshot, viewedKid: Kid | null): StatusSlot {
  const pending = pendingChecks(snap);
  if (pending.length > 0) {
    const first = pending[0];
    return {
      type: "check",
      count: pending.length,
      label: `${first.kid.name} · ${sheetLabel(first.sheet)}`,
    };
  }
  if (viewedKid && kidWeekDone(snap, viewedKid)) return { type: "caughtup" };
  return null;
}

/* ------------------------------------------------------------------ display */

export function pronounFor(kid: Kid): string {
  return kid.name === "Gina" ? "her" : kid.name === "Leo" ? "his" : "their";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function scannedText(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? "scanned today" : `scanned ${shortDate(iso)}`;
}

/** One-line summary for a Results screen, in the prototype's voice. */
export function summaryText(st: SheetState): string {
  if (!st.score || !st.key || !st.result) return "";
  const { kid, score } = { kid: st.kid, score: st.score };
  if (score.isFinal && score.wrong === 0) {
    return `Wonderful work, ${kid.name} — every answer is right.`;
  }
  // Name the topic of the first wrong (or resolved-wrong) question.
  const resolvedWrong = new Set(
    st.resolutions.filter((r) => r.resolution === "wrong").map((r) => r.questionNumber),
  );
  const wrongQ = st.result.perQuestion.find(
    (g) => g.verdict === "wrong" || resolvedWrong.has(g.questionNumber),
  );
  const topic = wrongQ
    ? st.key.questions.find((q) => q.number === wrongQ.questionNumber)?.topic
    : undefined;
  if (topic) {
    const topicText = topic.charAt(0).toLowerCase() + topic.slice(1);
    return `Great work, ${kid.name}! ${topicText} is the one to keep practising — it's tracked in ${pronounFor(kid)} progress.`;
  }
  return `Great work, ${kid.name}! We marked the sheet.`;
}
