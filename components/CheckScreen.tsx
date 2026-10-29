"use client";

import { Card } from "@heroui/react";
import { sheetLabel, type CheckItem } from "@/lib/derive";
import { BackButton, ScreenHeader } from "./ui";

interface Props {
  items: CheckItem[];
  onBack: () => void;
  onResolve: (item: CheckItem, resolution: "correct" | "wrong") => void;
}

export default function CheckScreen({ items, onBack, onResolve }: Props) {
  return (
    <div className="px-[18px] pb-6 pt-3">
      <BackButton onPress={onBack} />
      <ScreenHeader kicker="Practice Sheets" title="Needs your check" />
      <p className="-mt-2 mb-4 text-[14.5px] leading-snug text-mid">
        We never guess. If we can&rsquo;t read an answer, you settle it.
      </p>

      {items.length === 0 && (
        <Card className="border border-leaf/30 bg-leafsoft shadow-none">
          <Card.Content className="p-5 text-center">
            <p className="text-[16px] font-extrabold text-leaf">Nothing needs your check 🎉</p>
            <p className="mt-1 text-[13.5px] text-mid">Every answer has been marked.</p>
          </Card.Content>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <Card
            key={`${item.gradeResultId}-${item.questionNumber}`}
            className="shadow-[0_2px_7px_rgba(146,90,32,0.12)]"
          >
            <Card.Content className="p-4">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-faint">
                {item.kid.name} · {sheetLabel(item.sheet)} · Q{item.questionNumber}
              </p>
              <p className="mt-2 text-[19px] font-extrabold text-ink">
                {item.prompt}
                {!item.prompt.includes("?") ? " = ?" : ""}
              </p>
              <p className="mt-1 text-[14px] text-mid">
                {item.readAnswer ? (
                  <>
                    We think this looks like{" "}
                    <strong className="text-ink">{item.readAnswer}</strong> — can you check it
                    against the sheet?
                  </>
                ) : (
                  <>We couldn&rsquo;t read this answer at all — can you check it against the sheet?</>
                )}
              </p>
              <div className="mt-3.5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => onResolve(item, "correct")}
                  className="flex-1 rounded-full bg-leaf py-2.5 text-[15px] font-bold text-white"
                >
                  It was correct
                </button>
                <button
                  type="button"
                  onClick={() => onResolve(item, "wrong")}
                  className="flex-1 rounded-full border-[1.5px] border-rose bg-card py-2.5 text-[15px] font-bold text-rose"
                >
                  It was wrong
                </button>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>
    </div>
  );
}
