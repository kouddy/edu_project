"use client";

/**
 * PacketScreen — one packet (subject + week), from Homework or History.
 *
 * One row per section: the catalogue already says which topic each
 * sheet belongs to, so a week's packet is its topics and review kinds,
 * one row each. Tapping a section unfolds its sheets in place — they
 * carry the labels the printed pages use (Practice A, B, C… for
 * practice; Part 1, 2… for a review kind), with the printed code
 * underneath — and tapping a sheet opens it. A single-sheet section
 * is a plain sheet row in a card of its own, so it never blends in
 * with the section rows.
 */

import { type ReactNode } from "react";
import { isDone, partLabelFor, topicGroups, type SheetState } from "@/lib/derive";
import type { Kid } from "@/lib/store";
import { BackButton, CARD, ScreenHeader } from "./ui";

const PILL =
  "inline-block shrink-0 rounded-full border-[1.5px] px-2.5 py-[3px] text-[12px] font-bold";

function DonePill({ done }: { done: boolean }) {
  return (
    <span
      className={`${PILL} ${
        done ? "border-leaf bg-leaf text-[#fff8ec]" : "border-linesoft bg-fill text-mid"
      }`}
    >
      {done ? "Done" : "Not done"}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 text-mid transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 2.5 7.5 6 4 9.5" />
    </svg>
  );
}

function SheetRow({
  title,
  code,
  done,
  score,
  last,
  onOpen,
}: {
  title: string;
  code: string;
  done: boolean;
  /** A finished sheet's score, shown instead of the Done pill in History. */
  score?: { finalCorrect: number; total: number } | null;
  last: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-1.5 px-[17px] py-[11px] text-left ${
        last ? "" : "border-b border-dashed border-linesoft"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[12px] text-mid">{code}</span>
      </span>
      {score ? (
        <span className={`${PILL} border-linesoft bg-fill text-mid`}>
          {score.finalCorrect}/{score.total} final
        </span>
      ) : (
        <DonePill done={done} />
      )}
    </button>
  );
}

export default function PacketScreen({
  kid,
  subject,
  week,
  states,
  variant = "homework",
  openTopics,
  onOpenTopicsChange,
  onBack,
  onOpenSheet,
}: {
  kid: Kid;
  subject: string;
  week: number;
  states: SheetState[];
  /** History packets are finished: their sheet rows carry scores
   *  instead of Done pills. */
  variant?: "homework" | "history";
  /** Which sections are unfolded. Held by the shell, not this screen:
   *  opening a sheet unmounts the packet, and coming back must find
   *  the sections as they were left. */
  openTopics: ReadonlySet<string>;
  onOpenTopicsChange: (next: ReadonlySet<string>) => void;
  onBack: () => void;
  onOpenSheet: (sheetId: string) => void;
}) {
  const groups = topicGroups(states);
  const toggle = (topic: string) => {
    const next = new Set(openTopics);
    if (next.has(topic)) next.delete(topic);
    else next.add(topic);
    onOpenTopicsChange(next);
  };

  // Render in packet order as a stack of cards: runs of section rows
  // share one card; each single-sheet row gets a card of its own.
  const cards: ReactNode[] = [];
  let sections: typeof groups = [];
  const flushSections = () => {
    if (sections.length === 0) return;
    const run = sections;
    sections = [];
    cards.push(
      <div key={`sections-${cards.length}`} className={CARD}>
        {run.map((group, i) => {
          const open = openTopics.has(group.topic);
          return (
            <div
              key={group.topic}
              className={i === run.length - 1 ? "" : "border-b border-dashed border-linesoft"}
            >
              <button
                type="button"
                onClick={() => toggle(group.topic)}
                aria-expanded={open}
                className={`flex w-full items-center gap-2 px-[17px] py-[11px] text-left ${
                  open ? "border-b border-dashed border-linesoft" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">
                  {group.topic}
                </span>
                {group.done ? (
                  <DonePill done />
                ) : (
                  <span className="shrink-0 text-[12px] text-mid">
                    {group.doneCount} of {group.states.length} done
                  </span>
                )}
                <Chevron open={open} />
              </button>
              {open &&
                group.states.map((st, si) => (
                  <SheetRow
                    key={st.sheet.id}
                    title={partLabelFor(group.topic, si)}
                    code={st.sheet.printedCode}
                    done={isDone(st)}
                    score={variant === "history" ? st.score : undefined}
                    last={si === group.states.length - 1}
                    onOpen={() => onOpenSheet(st.sheet.id)}
                  />
                ))}
            </div>
          );
        })}
      </div>,
    );
  };
  for (const group of groups) {
    if (group.states.length === 1) {
      flushSections();
      const st = group.states[0];
      cards.push(
        <div key={group.topic} className={CARD}>
          <SheetRow
            title={st.sheet.topic}
            code={st.sheet.printedCode}
            done={isDone(st)}
            score={variant === "history" ? st.score : undefined}
            last
            onOpen={() => onOpenSheet(st.sheet.id)}
          />
        </div>,
      );
    } else {
      sections.push(group);
    }
  }
  flushSections();

  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <BackButton onPress={onBack} />
      <ScreenHeader
        title={`${kid.name} · ${subject} · Week ${week}`}
      />
      <div className="flex flex-col gap-3">{cards}</div>
    </div>
  );
}
