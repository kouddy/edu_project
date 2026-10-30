"use client";

/**
 * PacketScreen — one Homework group (subject + week).
 *
 * The catalogue already says which topic each sheet belongs to, so the
 * packet shows its sheets grouped under topic headers — no extra level
 * to tap through. A topic's sheets get the labels the printed pages
 * carry (Practice A, B, C… for practice; Part 1, 2… for a review kind),
 * with the printed code underneath. A single-sheet topic renders as a
 * plain sheet row. Every sheet opens directly from here.
 */

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
          return (
            <div key={group.topic} className={lastGroup ? "" : "border-b border-dashed border-linesoft"}>
              <div className="flex items-baseline justify-between gap-2 px-[17px] pb-0.5 pt-[11px]">
                <span className="min-w-0 truncate text-[14.5px] font-semibold text-ink">
                  {group.topic}
                </span>
                <span className="shrink-0 text-[12px] text-mid">
                  {group.done
                    ? `All ${group.states.length} done`
                    : `${group.doneCount} of ${group.states.length} done`}
                </span>
              </div>
              {group.states.map((st, si) => (
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
