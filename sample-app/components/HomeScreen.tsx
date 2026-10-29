"use client";

import { Button, Card, Chip } from "@heroui/react";
import {
  homeworkStates,
  historyStates,
  isDone,
  kidHasGradedSheet,
  reviewRetentionText,
  sheetLabel,
  shortDate,
  statusSlot,
  streakFor,
  type SheetState,
  type Snapshot,
} from "@/lib/derive";
import type { Kid } from "@/lib/store";
import { IconDownload } from "./ui";

interface Props {
  snap: Snapshot;
  kid: Kid;
  onSelectKid: (kid: Kid) => void;
  onOpenSheet: (sheetId: string, origin: "homework" | "history") => void;
  onOpenCheck: () => void;
  showToast: (msg: string) => void;
  scrollSection: "homework" | "history" | null;
}

export default function HomeScreen({
  snap,
  kid,
  onSelectKid,
  onOpenSheet,
  onOpenCheck,
  showToast,
  scrollSection,
}: Props) {
  const status = statusSlot(snap, kid);
  const homework = homeworkStates(snap, kid);
  const history = historyStates(snap, kid);
  const showProgress = kidHasGradedSheet(snap, kid);
  const retention = reviewRetentionText(snap, kid);

  return (
    <div className="px-[18px] pb-6 pt-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-tang">
        Practice Sheets
      </p>
      <h1 className="mb-4 mt-0.5 text-[28px] font-extrabold leading-tight text-ink">Home</h1>

      {/* ---- status slot ---- */}
      {status?.type === "check" && (
        <Card className="mb-4 border border-amberish/50 bg-ambersoft shadow-none">
          <Card.Content className="flex-row items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-extrabold text-ink">
                {status.count} {status.count === 1 ? "answer needs" : "answers need"} your check
              </p>
              <p className="truncate text-[13px] text-mid">{status.label}</p>
            </div>
            <Button size="sm" onPress={onOpenCheck} className="shrink-0 font-bold">
              Check now
            </Button>
          </Card.Content>
        </Card>
      )}
      {status?.type === "caughtup" && (
        <Card className="mb-4 border border-leaf/30 bg-leafsoft shadow-none">
          <Card.Content className="p-4">
            <p className="text-[16px] font-extrabold text-leaf">All caught up for this week 🎉</p>
          </Card.Content>
        </Card>
      )}

      {/* ---- kid switcher ---- */}
      {snap.kids.length > 1 && (
        <div className="mb-5 flex gap-2">
          {snap.kids.map((k) => {
            const active = k.id === kid.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => onSelectKid(k)}
                className={`rounded-full px-4 py-2 text-[15px] font-bold transition-colors ${
                  active ? "bg-tang text-white" : "bg-fill text-mid"
                }`}
              >
                {k.name}
              </button>
            );
          })}
        </div>
      )}
      {snap.kids.length <= 1 && <h2 className="mb-3 text-[20px] font-extrabold text-ink">{kid.name}</h2>}

      {/* ---- homework ---- */}
      <section id="section-homework" className="scroll-mt-4">
        <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.12em] text-faint">
          Homework · Week {homework[0]?.sheet.week ?? ""}
        </h2>
        <Card className="mb-5 shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
          <Card.Content className="p-0">
            {homework.map((st, i) => (
              <HomeworkRow
                key={st.sheet.id}
                st={st}
                first={i === 0}
                onOpen={() => onOpenSheet(st.sheet.id, "homework")}
                onDownload={() => showToast(`Saved: ${sheetLabel(st.sheet)} sheets (PDF)`)}
              />
            ))}
            {homework.length === 0 && (
              <p className="p-4 text-[14px] text-mid">Nothing assigned for this week yet.</p>
            )}
          </Card.Content>
        </Card>
      </section>

      {/* ---- progress ---- */}
      {showProgress && (
        <section className="mb-5">
          <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.12em] text-faint">
            Progress
          </h2>
          <Card className="shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
            <Card.Content className="flex-row p-4">
              <div className="flex-1">
                <p className="text-[26px] font-extrabold leading-none text-ink">
                  {streakFor(snap, kid)} weeks
                </p>
                <p className="mt-1 text-[13px] text-mid">Weekly streak</p>
              </div>
              {retention && (
                <div className="flex-1 border-l border-dashed border-linesoft pl-4">
                  <p className="text-[26px] font-extrabold leading-none text-ink">
                    {retention.split(" ")[0]}
                  </p>
                  <p className="mt-1 text-[13px] text-mid">of last month&rsquo;s review, still correct</p>
                </div>
              )}
            </Card.Content>
          </Card>
        </section>
      )}

      {/* ---- history ---- */}
      <section id="section-history" className="scroll-mt-4">
        <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.12em] text-faint">
          History
        </h2>
        <Card className="shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
          <Card.Content className="p-0">
            {history.map((st, i) => (
              <button
                key={st.sheet.id}
                type="button"
                onClick={() => onOpenSheet(st.sheet.id, "history")}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${
                  i > 0 ? "border-t border-dashed border-linesoft" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-bold text-ink">
                    {sheetLabel(st.sheet)}
                  </span>
                  <span className="block text-[12.5px] text-faint">
                    Graded {st.result ? shortDate(st.result.gradedAt) : ""}
                  </span>
                </span>
                {st.score && (
                  <Chip color="success" variant="soft" size="sm" className="shrink-0 font-bold">
                    {st.score.finalCorrect}/{st.score.total} final
                  </Chip>
                )}
              </button>
            ))}
            {history.length === 0 && (
              <p className="p-4 text-[14px] text-mid">No sheets scanned yet.</p>
            )}
          </Card.Content>
        </Card>
      </section>
    </div>
  );
}

function HomeworkRow({
  st,
  first,
  onOpen,
  onDownload,
}: {
  st: SheetState;
  first: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const done = isDone(st);
  return (
    <div
      className={`flex w-full items-center gap-2 px-4 ${first ? "" : "border-t border-dashed border-linesoft"}`}
    >
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-3.5 text-left">
        <span className="block truncate text-[15.5px] font-bold text-ink">{sheetLabel(st.sheet)}</span>
        <span className="block truncate text-[12.5px] text-faint">{st.sheet.topic}</span>
      </button>
      <Chip
        color={done ? "success" : "default"}
        variant="soft"
        size="sm"
        className="shrink-0 font-bold"
      >
        {done ? "Done" : "Not done"}
      </Chip>
      <button
        type="button"
        aria-label={`Download ${sheetLabel(st.sheet)} sheets (PDF)`}
        onClick={onDownload}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-tang"
      >
        <IconDownload size={20} />
      </button>
    </div>
  );
}
