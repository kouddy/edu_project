"use client";

/**
 * PacketScreen — one Homework group (subject + week).
 *
 * One row per section: the catalogue already says which topic each
 * sheet belongs to, so a week's packet is its topics and review kinds,
 * one row each. Tapping a section unfolds its sheets in place — they
 * carry the labels the printed pages use (Practice A, B, C… for
 * practice; Part 1, 2… for a review kind), with the printed code
 * underneath — and tapping a sheet opens it. A single-sheet section
 * is a plain sheet row.
 */

import { useState } from "react";
import { isDone, topicGroups, type SheetState } from "@/lib/derive";
import type { Kid } from "@/lib/store";
import { BackButton, ScreenHeader } from "./ui";

const CARD =
  "rounded-[16px] border-[1.5px] border-linesoft bg-card shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
const PILL =
  "inline-block shrink-0 rounded-full border-[1.5px] px-2.5 py-[3px] text-[12px] font-bold";

/** Topic strings that are review kinds rather than practice topics —
 *  their sheets are parts of one review, not lettered practice pages. */
const REVIEW_TOPICS = new Set([
  "Anchor Review",
  "Consolidation Review",
  "Spiral Review",
  "Review Week",
]);

function partLabel(topic: string, index: number): string {
  return REVIEW_TOPICS.has(topic)
    ? `Part ${index + 1}`
    : `Practice ${String.fromCharCode(65 + index)}`;
}

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
  last,
  onOpen,
}: {
  title: string;
  code: string;
  done: boolean;
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
      <DonePill done={done} />
    </button>
  );
}

export default function PacketScreen({
  kid,
  subject,
  week,
  states,
  onBack,
  onOpenSheet,
}: {
  kid: Kid;
  subject: string;
  week: number;
  states: SheetState[];
  onBack: () => void;
  onOpenSheet: (sheetId: string) => void;
}) {
  const groups = topicGroups(states);
  const [openTopics, setOpenTopics] = useState<ReadonlySet<string>>(new Set());
  const toggle = (topic: string) =>
    setOpenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });

  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <BackButton onPress={onBack} />
      <ScreenHeader
        kicker="Practice Sheets"
        title={`${kid.name} · ${subject} · Week ${week}`}
      />
      <div className={CARD}>
        {groups.map((group, gi) => {
          const lastGroup = gi === groups.length - 1;
          if (group.states.length === 1) {
            const st = group.states[0];
            return (
              <SheetRow
                key={group.topic}
                title={st.sheet.topic}
                code={st.sheet.printedCode}
                done={isDone(st)}
                last={lastGroup}
                onOpen={() => onOpenSheet(st.sheet.id)}
              />
            );
          }
          const open = openTopics.has(group.topic);
          return (
            <div
              key={group.topic}
              className={lastGroup ? "" : "border-b border-dashed border-linesoft"}
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
                    title={partLabel(group.topic, si)}
                    code={st.sheet.printedCode}
                    done={isDone(st)}
                    last={si === group.states.length - 1}
                    onOpen={() => onOpenSheet(st.sheet.id)}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
