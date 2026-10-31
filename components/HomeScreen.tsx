"use client";

import {
  homeworkGroups,
  historyStates,
  kidHasGradedSheet,
  reviewRetentionText,
  scannedText,
  sheetLabel,
  shortDate,
  statusSlot,
  streakFor,
  type HomeworkGroup,
  type Snapshot,
} from "@/lib/derive";
import type { Kid } from "@/lib/store";
import { Spinner } from "@heroui/react";

/** The Home Marking card's data, built by the app shell. */
interface MarkingCardData {
  /** One entry per photo across all in-flight jobs, in order. `step`
   *  is true only for the photo being worked on right now — photos
   *  still queued have no step yet. */
  photos: { label: string | null; state: "marking" | "marked" | "settled"; step: boolean }[];
  /** When the oldest in-flight job was submitted (ETA estimate). */
  startedAt: number | null;
  /** Settled summary lines, shown until dismissed. */
  summary: string[] | null;
  onDismissSummary: () => void;
}

interface Props {
  snap: Snapshot;
  kid: Kid;
  onSelectKid: (kid: Kid) => void;
  onOpenSheet: (sheetId: string, origin: "homework" | "history") => void;
  onOpenGroup: (subject: string, week: number) => void;
  onOpenCheck: () => void;
  scrollSection: "homework" | "history" | null;
  marking: MarkingCardData | null;
}

/* Styled directly from the wireframe's CSS (.card, .btn, .pill, .chip) so
   the screen reads the same, rather than approximated through components. */
const CARD =
  "mb-3 rounded-[16px] border-[1.5px] border-linesoft bg-card shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
const H3 = "font-display text-[15.5px] font-extrabold text-ink";
const PILL =
  "inline-block shrink-0 rounded-full border-[1.5px] px-2.5 py-[3px] text-[12px] font-bold";
const BTN =
  "block w-full rounded-[12px] border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[14px] py-[13px] text-center text-[15.5px] font-bold text-[#fff8ec] shadow-[0_3px_8px_rgba(199,91,0,0.28)]";

export default function HomeScreen({
  snap,
  kid,
  onSelectKid,
  onOpenSheet,
  onOpenGroup,
  onOpenCheck,
  marking,
}: Props) {
  const status = statusSlot(snap, kid);
  /* Homework is grouped by subject + week: one row per packet. The
     wireframe lists Word Problems ahead of Math in the Homework card. */
  const homeworkRows = [...homeworkGroups(snap, kid)].sort(
    (a, b) =>
      (a.subject === "Word Problems" ? 0 : 1) - (b.subject === "Word Problems" ? 0 : 1),
  );
  const history = historyStates(snap, kid);
  const showProgress = kidHasGradedSheet(snap, kid);
  const retention = reviewRetentionText(snap, kid);

  /* The check card's copy, in the wireframe's words: the label arrives as
     "Amy · Math · Week 40" and reads "Amy · Math Week 40" / "Math Week 40". */
  const checkParts = status?.type === "check" ? status.label.split(" · ") : [];
  const checkKid = checkParts[0] ?? "";
  const checkSheet = checkParts.slice(1).join(" ");

  /* Marking summary: parents need a count and a sense of time, not a
     per-photo log or extra controls. */
  const mPhotos = marking?.photos ?? [];
  const mTotal = mPhotos.length;
  const mDone = mPhotos.filter((p) => p.state !== "marking").length;
  const mSteppedIdx = mPhotos.findIndex((p) => p.state === "marking" && p.step);
  const mCurrentIdx =
    mSteppedIdx >= 0 ? mSteppedIdx : mPhotos.findIndex((p) => p.state === "marking");
  const mCurrent = mCurrentIdx >= 0 ? mPhotos[mCurrentIdx] : null;
  let mEta: string | null = null;
  if (marking?.startedAt && mDone >= 3 && mDone < mTotal) {
    const remainMs = ((Date.now() - marking.startedAt) / mDone) * (mTotal - mDone);
    if (remainMs >= 45_000) {
      const mins = Math.max(1, Math.round(remainMs / 60_000));
      mEta = `About ${mins} more minute${mins === 1 ? "" : "s"}`;
    }
  }

  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <p className="mb-1.5 mt-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-tangdeep">
        Practice Sheets
      </p>
      <h1 className="mb-1.5 font-display text-[23px] font-extrabold leading-[1.15] text-ink">
        Home
      </h1>

      {/* ---- marking card ---- */}
      {marking && (
        <div className={`${CARD} px-[15px] py-[14px]`}>
          {mTotal > 0 && (
            <>
              <div className="flex items-center gap-2">
                <Spinner size="sm" color="accent" />
                <h3 className={H3}>Marking your sheets…</h3>
                <span className="ml-auto text-[13px] font-bold text-tangdeep">
                  {mDone} of {mTotal} marked
                </span>
              </div>
              <div className="mt-2.5 h-[7px] overflow-hidden rounded-full bg-linesoft">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#f07d12,#e8710a)] transition-[width] duration-500"
                  style={{ width: `${Math.round((mDone / mTotal) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[13.5px] leading-[1.45] text-mid">
                {mCurrent
                  ? mCurrent.label
                    ? `Now marking: ${mCurrent.label}`
                    : `Now marking sheet ${mCurrentIdx + 1} of ${mTotal}`
                  : "Finishing up…"}
                {mEta && <span className="text-faint"> · {mEta}</span>}
              </p>
            </>
          )}
          {marking.summary && marking.summary.length > 0 && (
            <div className={mTotal > 0 ? "mt-3 border-t border-dashed border-linesoft pt-3" : ""}>
              <div className="space-y-1">
                {marking.summary.map((line, i) => (
                  <p key={i} className="text-[13.5px] leading-[1.45] text-mid">
                    {line}
                  </p>
                ))}
              </div>
              <button
                type="button"
                onClick={marking.onDismissSummary}
                className="mt-2.5 text-[13.5px] font-bold text-tangdeep"
              >
                Got it
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- status slot ---- */}
      {status?.type === "check" && (
        <div className={`${CARD} px-[15px] py-[14px]`}>
          <div className="flex items-center justify-between gap-2.5">
            <h3 className={H3}>
              {status.count} {status.count === 1 ? "answer needs" : "answers need"} your check
            </h3>
            <span className={`${PILL} border-tangdeep bg-tang text-[#fff8ec]`}>
              {status.count}
            </span>
          </div>
          <p className="mt-0.5 text-[13.5px] font-semibold text-ink">
            {checkKid} · {checkSheet}
          </p>
          <p className="text-[13.5px] leading-[1.45] text-mid">
            We marked {checkSheet}, but we couldn’t read {status.count}{" "}
            {status.count === 1 ? "answer" : "answers"} for sure. A quick look settles the score.
          </p>
          <button type="button" onClick={onOpenCheck} className={`${BTN} mt-[11px]`}>
            Check now
          </button>
        </div>
      )}
      {status?.type === "caughtup" && (
        <div className="mb-3 rounded-[16px] border-[1.5px] border-[#bcd8b2] bg-[#eaf4e4] px-[15px] py-[14px] text-center font-display text-[15.5px] font-extrabold leading-[1.35] text-[#2f5d2a] shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]">
          All caught up for this week 🎉
        </div>
      )}

      {/* ---- kid switcher ---- */}
      {snap.kids.length > 1 && (
        <div className="mb-4 mt-1 flex flex-wrap gap-2">
          {snap.kids.map((k) => {
            const active = k.id === kid.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => onSelectKid(k)}
                className={`rounded-full border-[1.5px] px-[15px] py-2 text-[14px] font-semibold transition-colors ${
                  active
                    ? "border-tang bg-tang text-[#fff8ec]"
                    : "border-line bg-card text-mid"
                }`}
              >
                {k.name}{" "}
                <span className="text-[11.5px] font-medium opacity-75">· Grade {k.grade}</span>
              </button>
            );
          })}
        </div>
      )}
      {snap.kids.length <= 1 && (
        <p className="mb-4 mt-0.5 font-display text-[16px] font-extrabold text-ink">
          {kid.name}{" "}
          <span className="text-[13.5px] font-semibold text-mid">· Grade {kid.grade}</span>
        </p>
      )}

      {/* ---- homework ---- */}
      <section id="section-homework" className="scroll-mt-4">
        <div className={CARD}>
          <h3 className={`${H3} px-[15px] pb-2 pt-[14px]`}>Homework</h3>
          {homeworkRows.map((group, i) => (
            <HomeworkRow
              key={`${group.subject}|${group.week}`}
              group={group}
              last={i === homeworkRows.length - 1}
              onOpen={() =>
                group.states.length === 1
                  ? onOpenSheet(group.states[0].sheet.id, "homework")
                  : onOpenGroup(group.subject, group.week)
              }
            />
          ))}
          {homeworkRows.length === 0 && (
            <p className="px-[15px] pb-[14px] text-[13.5px] text-mid">No homework assigned yet.</p>
          )}
        </div>
      </section>

      {/* ---- progress ---- */}
      {showProgress && (
        <div className={CARD}>
          <h3 className={`${H3} px-[15px] pb-0.5 pt-[14px]`}>Progress</h3>
          <div className="px-[17px] py-[11px]">
            <p className="text-[14.5px] font-semibold text-ink">
              ★ {streakFor(snap, kid)}-week streak
            </p>
            <p className="text-[12.5px] text-mid">Every pack finished, week after week</p>
          </div>
          {retention && (
            <div className="flex items-center justify-between gap-2 border-t border-dashed border-linesoft px-[17px] py-[11px]">
              <div>
                <p className="text-[14.5px] font-semibold text-ink">Review from last month</p>
                <p className="text-[12.5px] text-mid">Last month’s questions, asked again</p>
              </div>
              <span className={`${PILL} border-linesoft bg-fill text-mid`}>{retention}</span>
            </div>
          )}
        </div>
      )}

      {/* ---- history ---- */}
      {history.length > 0 ? (
        <section id="section-history" className="scroll-mt-4">
          <div className={CARD}>
            <h3 className={`${H3} px-[15px] pb-0.5 pt-[14px]`}>History</h3>
            {history.map((st, i) => (
              <button
                key={st.sheet.id}
                type="button"
                onClick={() => onOpenSheet(st.sheet.id, "history")}
                className={`flex w-full items-center justify-between gap-2 px-[17px] py-[11px] text-left ${
                  i < history.length - 1 ? "border-b border-dashed border-linesoft" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-semibold text-ink">
                    {sheetLabel(st.sheet)}
                  </span>
                  <span className="block text-[12.5px] text-mid">
                    {st.sheet.setName
                      ? capitalize(scannedText(st.result?.gradedAt))
                      : `Graded ${st.result ? shortDate(st.result.gradedAt) : ""}`}
                  </span>
                </span>
                {st.score && (
                  <span className={`${PILL} border-linesoft bg-fill text-mid`}>
                    {st.score.finalCorrect}/{st.score.total} final
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="mb-3 rounded-[16px] border-[1.5px] border-dashed border-line bg-card px-[15px] py-[14px] text-center shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]">
          <div className="mb-2.5 mt-2.5 text-[38px] leading-none text-tang">▤</div>
          <h3 className={`${H3} mb-1`}>No sheets scanned yet</h3>
          <p className="text-[13.5px] leading-[1.45] text-mid">
            When {kid.name} finishes their first sheet, tap Scan below to add it — grading takes
            a few seconds.
          </p>
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function HomeworkRow({
  group,
  last,
  onOpen,
}: {
  group: HomeworkGroup;
  last: boolean;
  onOpen: () => void;
}) {
  const single = group.states.length === 1 ? group.states[0].sheet : null;
  const subtitle = single
    ? `${single.topic} · ${single.printedCode}`
    : group.done
      ? `All ${group.states.length} sheets done`
      : group.doneCount > 0
        ? `${group.doneCount} of ${group.states.length} sheets done`
        : `${group.states.length} sheets`;
  return (
    <div
      className={`flex w-full items-center gap-1.5 px-[17px] py-[11px] ${
        last ? "" : "border-b border-dashed border-linesoft"
      }`}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[14.5px] font-semibold text-ink">
          {group.subject} · Week {group.week}
        </span>
        <span className="block truncate text-[12px] text-mid">{subtitle}</span>
      </button>
      <span
        className={`${PILL} ${
          group.done ? "border-leaf bg-leaf text-[#fff8ec]" : "border-linesoft bg-fill text-mid"
        }`}
      >
        {group.done ? "Done" : "Not done"}
      </span>
    </div>
  );
}
