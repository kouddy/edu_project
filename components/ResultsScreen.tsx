"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "@heroui/react";
import { getPhoto } from "@/lib/store";
import { removeSetCDemo, resetWeek12Demo } from "@/lib/demo";
import { GINA_MATH_SETC, GINA_MATH_W12 } from "@/lib/seed";
import {
  scannedText,
  sheetLabel,
  summaryText,
  type SheetState,
} from "@/lib/derive";
import { BackButton, ScoreBadges, ScreenHeader, VerdictIcon } from "./ui";

/* ------------------------------------------------------------- results */

interface ResultsProps {
  st: SheetState;
  onBack: () => void;
  onOpenCheck: () => void;
  onRemoved: () => void;
  showToast: (msg: string) => void;
}

export default function ResultsScreen({ st, onBack, onOpenCheck, onRemoved, showToast }: ResultsProps) {
  const { sheet, kid, key, result, score } = st;
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const firstPhotoKey = st.submission?.photoKeys[0];
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    if (firstPhotoKey) {
      getPhoto(firstPhotoKey)
        .then((blob) => {
          if (blob && live) {
            url = URL.createObjectURL(blob);
            setPhotoUrl(url);
          }
        })
        .catch(() => {});
    }
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [firstPhotoKey]);

  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  if (!result || !score || !key) return null;

  const removable = sheet.id === GINA_MATH_W12 || sheet.id === GINA_MATH_SETC;

  const handleRemove = async () => {
    if (!armed) {
      setArmed(true);
      armTimer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    if (sheet.id === GINA_MATH_W12) await resetWeek12Demo();
    else await removeSetCDemo();
    showToast("Sheet removed");
    onRemoved();
  };

  const resolutionFor = (n: number) => st.resolutions.find((r) => r.questionNumber === n);

  return (
    <div className="px-[18px] pb-6 pt-3">
      <BackButton onPress={onBack} />
      <ScreenHeader
        kicker="Practice Sheets"
        title="Results"
        sub={`${kid.name} · ${sheetLabel(sheet)} · ${scannedText(result.gradedAt)}`}
      />

      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Your photo of the sheet"
          className="mb-4 max-h-[340px] w-full rounded-2xl border border-linesoft object-cover"
        />
      )}

      <Card className="mb-4 shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
        <Card.Content className="p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-[15px] leading-snug text-ink">{summaryText(st)}</p>
          </div>
          <ScoreBadges score={score} align="start" />
        </Card.Content>
      </Card>

      {score.unsure > 0 && (
        <Card className="mb-4 border border-amberish/50 bg-ambersoft shadow-none">
          <Card.Content className="flex-row items-center gap-3 p-4">
            <p className="flex-1 text-[14.5px] font-bold text-ink">
              {score.unsure} {score.unsure === 1 ? "answer needs" : "answers need"} your check
            </p>
            <Button size="sm" onPress={onOpenCheck} className="shrink-0 font-bold">
              Check now
            </Button>
          </Card.Content>
        </Card>
      )}

      <h2 className="mb-2 text-[17px] font-extrabold text-ink">Question by question</h2>
      <Card className="shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
        <Card.Content className="p-0">
          {key.questions.map((q, i) => {
            const g = result.perQuestion.find((x) => x.questionNumber === q.number);
            if (!g) return null;
            const resolution = g.verdict === "unsure" ? resolutionFor(q.number) : undefined;
            const kind = g.verdict === "unsure" ? (resolution?.resolution ?? "unsure") : g.verdict;
            return (
              <div key={q.number} className={`px-4 py-3.5 ${i > 0 ? "border-t border-dashed border-linesoft" : ""}`}>
                <div className="flex items-start gap-3">
                  <VerdictIcon kind={kind} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15.5px] font-bold text-ink">
                      <span className="mr-1.5 text-faint">Q{q.number}</span>
                      {q.prompt}
                      {!q.prompt.includes("=") && !q.prompt.includes("?") ? " = " : " "}
                      {kind !== "unsure" && <span className="text-mid">{q.correctAnswer}</span>}
                    </p>
                    {g.verdict === "correct" && (
                      <p className="mt-0.5 text-[13.5px] text-mid">
                        {kid.name} wrote {g.readAnswer}
                      </p>
                    )}
                    {g.verdict === "wrong" && (
                      <>
                        <p className="mt-0.5 text-[13.5px] text-mid">
                          {kid.name} wrote {g.readAnswer} · Answer: {q.correctAnswer}
                        </p>
                        <p className="mt-2 rounded-xl bg-fill px-3 py-2 text-[13.5px] leading-snug text-mid">
                          {q.explanation}
                        </p>
                      </>
                    )}
                    {g.verdict === "unsure" && !resolution && (
                      <p className="mt-0.5 text-[13.5px] text-mid">
                        We couldn&rsquo;t read this answer
                        {g.readAnswer ? (
                          <>
                            {" "}— it looks like <strong className="text-ink">{g.readAnswer}</strong>
                          </>
                        ) : null}
                        . Answer: {q.correctAnswer}
                      </p>
                    )}
                    {g.verdict === "unsure" && resolution && (
                      <p className="mt-0.5 text-[13.5px] text-mid">
                        {kid.name} wrote {g.readAnswer} · You marked this {resolution.resolution}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </Card.Content>
      </Card>

      {removable && (
        <div className="mt-6 text-center">
          <Button
            variant={armed ? "danger" : "danger-soft"}
            size="sm"
            onPress={handleRemove}
            className="font-bold"
          >
            {armed ? "Tap again to remove" : "Remove this sheet"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- not started */

export function NotStartedScreen({
  st,
  onBack,
  onScan,
  showToast,
}: {
  st: SheetState;
  onBack: () => void;
  onScan: () => void;
  showToast: (msg: string) => void;
}) {
  const { sheet, kid } = st;
  return (
    <div className="px-[18px] pb-6 pt-3">
      <BackButton onPress={onBack} />
      <ScreenHeader
        kicker="Practice Sheets"
        title={sheetLabel(sheet)}
        sub={`${kid.name} · ${sheet.topic}`}
      />
      <Card className="mb-4 shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
        <Card.Content className="p-5 text-center">
          <p className="text-[19px] font-extrabold text-ink">Not started yet</p>
          <p className="mx-auto mt-1 max-w-[260px] text-[14px] leading-snug text-mid">
            When {kid.name} finishes this sheet, scan it and we&rsquo;ll mark it for you.
          </p>
        </Card.Content>
      </Card>
      <div className="flex flex-col gap-2.5">
        <Button size="lg" fullWidth onPress={onScan} className="font-bold">
          Scan the sheet
        </Button>
        <Button
          variant="outline"
          size="lg"
          fullWidth
          onPress={() => showToast(`Saved: ${sheetLabel(sheet)} sheets (PDF)`)}
          className="font-bold"
        >
          Download sheet (PDF)
        </Button>
      </div>
    </div>
  );
}
