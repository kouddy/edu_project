/**
 * lib/derive.ts — read-side helpers: one snapshot of everything the UI
 * needs, plus the derived state the screens share (homework rows, history,
 * pending checks, the status slot, streaks).
 *
 * Everything here reads through lib/store.ts only.
 */

import {
  getActiveMode,
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
  // Demo mode layers its own data: the demo account, its assigned
  // packets and its seeded history. Live mode seeds nothing — its
  // database mirrors the server (lib/live-sync.ts).
  if (getActiveMode() === "demo") ensureDemoData();
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

function currentWeek(snap: Snapshot, kid: Kid): number {
  let max = 0;
  for (const st of snap.states.values()) {
    if (st.kid.id === kid.id) max = Math.max(max, st.sheet.week);
  }
  return max;
}

/** This week's assigned sheets (the Homework list): weekly packets only. */
function homeworkStates(snap: Snapshot, kid: Kid): SheetState[] {
  const week = currentWeek(snap, kid);
  return [...snap.states.values()]
    .filter((st) => st.kid.id === kid.id && st.sheet.week === week && !st.sheet.setName)
    .sort((a, b) => sheetLabel(a.sheet).localeCompare(sheetLabel(b.sheet)));
}

export function isDone(st: SheetState): boolean {
  return !!st.score?.isFinal;
}

/** Sheets grouped the way packets are handed out: one entry per
 *  subject + week, holding that group's sheets in packet order. */
export interface HomeworkGroup {
  subject: string;
  week: number;
  states: SheetState[];
  doneCount: number;
  done: boolean;
  /** The most recent grading time inside the group, if any. */
  lastGradedAt: string | null;
}

function groupByWeek(states: SheetState[]): HomeworkGroup[] {
  const byKey = new Map<string, SheetState[]>();
  for (const st of states) {
    const key = `${st.sheet.subject}|${st.sheet.week}`;
    const list = byKey.get(key) ?? [];
    list.push(st);
    byKey.set(key, list);
  }
  return [...byKey.values()].map((list) => {
    const sorted = [...list].sort((a, b) =>
      a.sheet.printedCode.localeCompare(b.sheet.printedCode),
    );
    const doneCount = sorted.filter(isDone).length;
    const graded = sorted
      .map((st) => st.result?.gradedAt)
      .filter((d): d is string => !!d)
      .sort();
    return {
      subject: sorted[0].sheet.subject,
      week: sorted[0].sheet.week,
      states: sorted,
      doneCount,
      done: doneCount === sorted.length,
      lastGradedAt: graded[graded.length - 1] ?? null,
    };
  });
}

export function homeworkGroups(snap: Snapshot, kid: Kid): HomeworkGroup[] {
  return groupByWeek(homeworkStates(snap, kid));
}

/** One topic's sheets inside a packet, in packet order — the practice
 *  sheets of a topic, or a review kind's sheets, combined into one row. */
export interface TopicGroup {
  topic: string;
  states: SheetState[];
  doneCount: number;
  done: boolean;
}

export function topicGroups(states: SheetState[]): TopicGroup[] {
  const byTopic = new Map<string, SheetState[]>();
  for (const st of states) {
    const list = byTopic.get(st.sheet.topic) ?? [];
    list.push(st);
    byTopic.set(st.sheet.topic, list);
  }
  return [...byTopic.values()].map((list) => {
    const doneCount = list.filter(isDone).length;
    return {
      topic: list[0].sheet.topic,
      states: list,
      doneCount,
      done: doneCount === list.length,
    };
  });
}

function kidWeekDone(snap: Snapshot, kid: Kid): boolean {
  const rows = homeworkStates(snap, kid);
  return rows.length > 0 && rows.every(isDone);
}

/**
 * History: finished records only — final results that are not part of this
 * week's homework. A sheet still being marked, or still waiting on a
 * parent check, never appears here, so nothing in History can change.
 */
function historyStates(snap: Snapshot, kid: Kid): SheetState[] {
  const homeworkIds = new Set(homeworkStates(snap, kid).map((st) => st.sheet.id));
  return [...snap.states.values()]
    .filter(
      (st) =>
        st.kid.id === kid.id && st.score?.isFinal && !homeworkIds.has(st.sheet.id),
    )
    .sort((a, b) => (b.result?.gradedAt ?? "").localeCompare(a.result?.gradedAt ?? ""));
}

/** History grouped like Homework: one entry per subject + week,
 *  newest week first. */
export function historyGroups(snap: Snapshot, kid: Kid): HomeworkGroup[] {
  return groupByWeek(historyStates(snap, kid)).sort(
    (a, b) => b.week - a.week || a.subject.localeCompare(b.subject),
  );
}

export function kidHasGradedSheet(snap: Snapshot, kid: Kid): boolean {
  return [...snap.states.values()].some((st) => st.kid.id === kid.id && st.result);
}

/**
 * Weekly streak: consecutive finished weeks, counted back from the
 * most recent finished week. A week is finished when every one of its
 * sheets is final; the current week joins the streak once it is
 * finished, and an unfinished current week does not break a run of
 * finished weeks behind it.
 */
export function streakFor(snap: Snapshot, kid: Kid): number {
  const byWeek = new Map<number, SheetState[]>();
  for (const st of snap.states.values()) {
    if (st.kid.id !== kid.id) continue;
    const rows = byWeek.get(st.sheet.week) ?? [];
    rows.push(st);
    byWeek.set(st.sheet.week, rows);
  }
  const finished = (week: number): boolean => {
    const rows = byWeek.get(week);
    return !!rows && rows.length > 0 && rows.every(isDone);
  };
  const start = [...byWeek.keys()].sort((a, b) => b - a).find(finished);
  if (start === undefined) return 0;
  let streak = 0;
  for (let week = start; finished(week); week--) streak++;
  return streak;
}

/**
 * Share of past weeks' review questions still answered correctly —
 * the review sheets from earlier packets, marked final. Null when the
 * kid has no finished review questions yet.
 */
export function reviewRetentionText(snap: Snapshot, kid: Kid): string | null {
  if (!kidHasGradedSheet(snap, kid)) return null;
  const current = currentWeek(snap, kid);
  let total = 0;
  let correct = 0;
  for (const st of snap.states.values()) {
    if (st.kid.id !== kid.id || !st.result || !st.key || !st.score?.isFinal) continue;
    if (st.sheet.week >= current) continue;
    const resolved = new Map(st.resolutions.map((r) => [r.questionNumber, r.resolution]));
    for (const g of st.result.perQuestion) {
      const q = st.key.questions.find((x) => x.number === g.questionNumber);
      if (!q?.isReview) continue;
      total++;
      const effective = g.verdict === "unsure" ? resolved.get(g.questionNumber) : g.verdict;
      if (effective === "correct") correct++;
    }
  }
  return total > 0 ? `${correct}/${total} still correct` : null;
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
  /** The submission's uploaded photos — the parent checks the read
   *  against the real sheet, not a rendering of it. */
  photoKeys: string[];
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
        photoKeys: st.submission?.photoKeys ?? [],
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

function pronounFor(kid: Kid): string {
  // One neutral pronoun for every kid — the summaries never need a
  // name-specific form.
  void kid;
  return "their";
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
    if (st.sheet.subject === "Word Problems") {
      const possessive = pronounFor(kid);
      const subject = possessive === "her" ? "she" : possessive === "his" ? "he" : "they";
      return `Perfect score, ${kid.name}! Every word problem solved — ${subject} read each one carefully and showed the right operation every time.`;
    }
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
    if (!score.isFinal && score.unsure > 0) {
      const lower = topic.charAt(0).toLowerCase() + topic.slice(1);
      return `Great work, ${kid.name}! Watch out for ${lower}. Once you check the ${score.unsure} unsure answer${score.unsure === 1 ? "" : "s"}, this score is final.`;
    }
    return `Great work, ${kid.name}! ${topic} is the one to keep practising — it's tracked in ${pronounFor(kid)} progress.`;
  }
  return `Great work, ${kid.name}! We marked the sheet.`;
}
