"use client";

/**
 * PacketScreen — one Homework group (subject + week), with its sheets
 * combined by topic: a topic's practice sheets (or a review kind's
 * sheets) form one row, and TopicScreen lists that row's sheets.
 * A single-sheet topic opens its sheet directly. Sheets stay in packet
 * order (printed code order) at every level.
 */

import { isDone, topicGroups, type SheetState, type TopicGroup } from "@/lib/derive";
import type { Kid } from "@/lib/store";
import { BackButton, ScreenHeader } from "./ui";

const CARD =
  "rounded-[16px] border-[1.5px] border-linesoft bg-card shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
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

function progressText(done: boolean, doneCount: number, total: number): string {
  if (done) return `All ${total} sheets done`;
  if (doneCount > 0) return `${doneCount} of ${total} sheets done`;
  return `${total} sheets`;
}

function SheetRow({
  st,
  last,
  onOpen,
}: {
  st: SheetState;
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
        <span className="block truncate text-[14.5px] font-semibold text-ink">
          {st.sheet.topic}
        </span>
        <span className="block truncate text-[12px] text-mid">{st.sheet.printedCode}</span>
      </span>
      <DonePill done={isDone(st)} />
    </button>
  );
}

function TopicRow({
  group,
  last,
  onOpen,
}: {
  group: TopicGroup;
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
        <span className="block truncate text-[14.5px] font-semibold text-ink">
          {group.topic}
        </span>
        <span className="block truncate text-[12px] text-mid">
          {progressText(group.done, group.doneCount, group.states.length)}
        </span>
      </span>
      <DonePill done={group.done} />
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
  onOpenTopic,
}: {
  kid: Kid;
  subject: string;
  week: number;
  states: SheetState[];
  onBack: () => void;
  onOpenSheet: (sheetId: string) => void;
  onOpenTopic: (topic: string) => void;
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
        {groups.map((group, i) =>
          group.states.length === 1 ? (
            <SheetRow
              key={group.topic}
              st={group.states[0]}
              last={i === groups.length - 1}
              onOpen={() => onOpenSheet(group.states[0].sheet.id)}
            />
          ) : (
            <TopicRow
              key={group.topic}
              group={group}
              last={i === groups.length - 1}
              onOpen={() => onOpenTopic(group.topic)}
            />
          ),
        )}
      </div>
    </div>
  );
}

export function TopicScreen({
  kid,
  topic,
  states,
  onBack,
  onOpenSheet,
}: {
  kid: Kid;
  topic: string;
  states: SheetState[];
  onBack: () => void;
  onOpenSheet: (sheetId: string) => void;
}) {
  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <BackButton onPress={onBack} />
      <ScreenHeader kicker="Practice Sheets" title={`${kid.name} · ${topic}`} />
      <div className={CARD}>
        {states.map((st, i) => (
          <SheetRow
            key={st.sheet.id}
            st={st}
            last={i === states.length - 1}
            onOpen={() => onOpenSheet(st.sheet.id)}
          />
        ))}
      </div>
    </div>
  );
}
