"use client";

/**
 * PacketScreen — the sheets inside one Homework group (subject + week).
 *
 * A week's packet is several physical sheets; Home lists the packet as a
 * single row, and this screen lists its sheets in packet order (printed
 * code order), each opening that sheet's own state.
 */

import { isDone, type SheetState } from "@/lib/derive";
import type { Kid } from "@/lib/store";
import { BackButton, ScreenHeader } from "./ui";

const CARD =
  "rounded-[16px] border-[1.5px] border-linesoft bg-card shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
const PILL =
  "inline-block shrink-0 rounded-full border-[1.5px] px-2.5 py-[3px] text-[12px] font-bold";

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
  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <BackButton onPress={onBack} />
      <ScreenHeader
        kicker="Practice Sheets"
        title={`${kid.name} · ${subject} · Week ${week}`}
      />
      <div className={CARD}>
        {states.map((st, i) => {
          const done = isDone(st);
          return (
            <button
              key={st.sheet.id}
              type="button"
              onClick={() => onOpenSheet(st.sheet.id)}
              className={`flex w-full items-center gap-1.5 px-[17px] py-[11px] text-left ${
                i === states.length - 1 ? "" : "border-b border-dashed border-linesoft"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold text-ink">
                  {st.sheet.topic}
                </span>
                <span className="block truncate text-[12px] text-mid">
                  {st.sheet.printedCode}
                </span>
              </span>
              <span
                className={`${PILL} ${
                  done
                    ? "border-leaf bg-leaf text-[#fff8ec]"
                    : "border-linesoft bg-fill text-mid"
                }`}
              >
                {done ? "Done" : "Not done"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
