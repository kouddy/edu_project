"use client";

import { useEffect, useRef, useState } from "react";
import { getPhoto } from "@/lib/store";
import { removeSetCDemo, resetWeek12Demo } from "@/lib/demo";
import { GINA_MATH_SETC, GINA_MATH_W12 } from "@/lib/seed";
import {
  scannedText,
  sheetLabel,
  summaryText,
  type SheetState,
} from "@/lib/derive";
import { BackButton, ScoreBadges, ScreenHeader } from "./ui";

/* Styled directly from the wireframe's Results (.banner, .mockphoto,
   summary card with top-right badges, .qrow list, bottom buttons):
   banner → photo → summary → question by question → actions. */
const CARD =
  "rounded-[16px] border-[1.5px] border-linesoft bg-card px-[15px] py-[14px] shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
const H3 = "font-display text-[15.5px] font-extrabold text-ink";
const BTN =
  "block w-full rounded-[12px] border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[14px] py-[13px] text-center text-[15.5px] font-bold text-[#fff8ec] shadow-[0_3px_8px_rgba(199,91,0,0.28)]";
const BTN_SECONDARY =
  "block w-full rounded-[12px] border-[1.5px] border-line bg-card px-[14px] py-[13px] text-center text-[15.5px] font-bold text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
const HAND = '"Segoe Print", "Comic Sans MS", cursive';

type Kind = "correct" | "wrong" | "unsure";

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
  const live = removable;

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

  const kindFor = (n: number): Kind => {
    const g = result.perQuestion.find((x) => x.questionNumber === n);
    if (!g) return "unsure";
    if (g.verdict !== "unsure") return g.verdict;
    return st.resolutions.find((r) => r.questionNumber === n)?.resolution ?? "unsure";
  };

  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <BackButton onPress={onBack} />
      <ScreenHeader
        kicker="Practice Sheets"
        title="Results"
        sub={`${kid.name} · ${sheetLabel(sheet)} · ${scannedText(result.gradedAt)}`}
      />

      {score.unsure > 0 && (
        <button
          type="button"
          onClick={onOpenCheck}
          className="mb-3 flex w-full items-center justify-between gap-2.5 rounded-[12px] border-[1.5px] border-dashed border-tangdeep bg-[#fdebd0] px-[14px] py-3 text-left text-[14px] font-bold text-ink shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]"
        >
          <span>
            {score.unsure} answer{score.unsure === 1 ? "" : "s"} need{score.unsure === 1 ? "s" : ""}{" "}
            your check
          </span>
          <span>→</span>
        </button>
      )}

      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={`Your photo of ${kid.name}'s sheet`}
          className="mb-3 block h-[220px] w-full rounded-[16px] border-[1.5px] border-linesoft object-cover shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]"
        />
      ) : (
        sheet.id !== GINA_MATH_W12 && <MockPhoto st={st} kindFor={kindFor} />
      )}

      <div className={`${CARD} mb-3`}>
        <div className="mb-2">
          <ScoreBadges score={score} align="end" />
        </div>
        <p className="text-[13.5px] leading-[1.45] text-mid">{summaryText(st)}</p>
      </div>

      <div className={CARD}>
        <h3 className={`${H3} mb-0.5`}>Question by question</h3>
        {key.questions.map((q) => {
          const g = result.perQuestion.find((x) => x.questionNumber === q.number);
          if (!g) return null;
          const kind = kindFor(q.number);
          const resolution =
            g.verdict === "unsure"
              ? st.resolutions.find((r) => r.questionNumber === q.number)
              : undefined;
          return (
            <div
              key={q.number}
              className="flex items-start gap-[11px] border-b border-dashed border-linesoft px-0.5 py-[11px] last:border-b-0"
            >
              <span className="w-[26px] shrink-0 pt-[3px] text-[12px] font-bold text-faint">
                Q{q.number}
              </span>
              <Badge kind={kind} />
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold leading-snug text-ink">
                  {q.prompt} = {q.correctAnswer}
                </div>
                <div className="mt-[1px] text-[13px] text-mid">
                  {kind === "unsure"
                    ? "We couldn't read this one for sure — needs your check."
                    : `${kid.name} wrote ${g.readAnswer}`}
                </div>
                {g.verdict === "wrong" && (
                  <div className="mt-[7px] whitespace-pre-line rounded-[9px] bg-[#fdebd0] px-2.5 py-2 text-[13px] leading-[1.45] text-ink">
                    {g.meta?.guidance ?? q.explanation}
                  </div>
                )}
                {resolution?.resolution === "wrong" && (
                  <div className="mt-[7px] rounded-[9px] bg-[#fdebd0] px-2.5 py-2 text-[13px] leading-[1.45] text-ink">
                    You marked this wrong. Correct answer: {q.correctAnswer}. Recorded in{" "}
                    {kid.name}&rsquo;s progress.
                  </div>
                )}
                {resolution?.resolution === "correct" && (
                  <div className="mt-[7px] rounded-[9px] bg-[#fdebd0] px-2.5 py-2 text-[13px] leading-[1.45] text-ink">
                    You confirmed {kid.name}&rsquo;s answer was correct.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {score.unsure > 0 && (
        <button type="button" onClick={onOpenCheck} className={`${BTN} mt-3`}>
          Check the {score.unsure} unsure answer{score.unsure === 1 ? "" : "s"}
        </button>
      )}
      <button type="button" onClick={onBack} className={`${BTN_SECONDARY} mt-2.5`}>
        {live ? "Done" : "Back"}
      </button>

      {removable &&
        (armed ? (
          <p className="mt-3 text-center">
            <button
              type="button"
              onClick={handleRemove}
              className="rounded-full border-[1.5px] border-[#a8321f] bg-[#d2492b] px-[18px] py-2.5 text-[14px] font-extrabold text-[#fff8ec]"
            >
              Tap again to remove
            </button>
          </p>
        ) : (
          <p className="mt-2.5 text-center">
            <button
              type="button"
              onClick={handleRemove}
              className="px-1 py-1.5 text-[13px] font-semibold text-[#b13a22] underline underline-offset-[3px]"
            >
              Remove this sheet
            </button>
          </p>
        ))}
    </div>
  );
}

function Badge({ kind }: { kind: Kind }) {
  const cls =
    kind === "correct"
      ? "border-leaf bg-leaf text-[#fff8ec]"
      : kind === "wrong"
        ? "border-rose bg-rose text-[#fff6ec]"
        : "border-[#d98a06] bg-[#f0a30c] text-[#402a12]";
  const mark = kind === "correct" ? "✓" : kind === "wrong" ? "✗" : "?";
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[13px] font-extrabold ${cls}`}
    >
      {mark}
    </span>
  );
}

/* The wireframe's .mockphoto: a paper rendering of the finished sheet,
   shown for graded sheets that have no real photo (the seeded past
   sheets). The live Week 12 demo sheet follows vResults instead — no
   photo until one is scanned. */
function MockPhoto({ st, kindFor }: { st: SheetState; kindFor: (n: number) => Kind }) {
  const { sheet, kid, key, result } = st;
  if (!key || !result) return null;
  const first = key.questions.slice(0, 5);
  return (
    <div
      className="mb-3 h-[220px] overflow-hidden rounded-[16px] border-[1.5px] border-linesoft bg-[#fdfcf6] shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]"
      role="img"
      aria-label={`Photo of ${kid.name}'s completed ${sheetLabel(sheet)} sheet`}
    >
      <div className="flex h-full flex-col bg-[linear-gradient(180deg,#fffef9,#fdf8ec)] px-[14px] pb-2.5 pt-3 text-[#3a2e22]">
        <div className="mb-[7px] flex items-start justify-between gap-2 border-b-2 border-[#d8c49a] pb-[7px]">
          <div>
            <div className="font-display text-[13.5px] font-extrabold leading-[1.2]">
              {sheetLabel(sheet)}
            </div>
            <div className="mt-0.5 text-[10.5px] leading-tight text-[#7a6248]">{sheet.topic}</div>
          </div>
          <div className="whitespace-nowrap text-right text-[10.5px] leading-tight text-[#7a6248]">
            Name:{" "}
            <b className="font-semibold text-[#2a4a8a]" style={{ fontFamily: HAND }}>
              {kid.name}
            </b>
            <br />
            Grade {kid.grade}
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-between">
          {first.map((q) => {
            const g = result.perQuestion.find((x) => x.questionNumber === q.number);
            const kind = kindFor(q.number);
            return (
              <div
                key={q.number}
                className="flex items-baseline justify-between gap-2.5 border-b border-dotted border-[#e3d3ae] py-0.5 text-[11px] leading-[1.25]"
              >
                <span className="min-w-0 text-[#5a4632]">
                  Q{q.number}. {q.prompt}
                </span>
                <span
                  className={`whitespace-nowrap text-[11.5px] text-[#2a4a8a] ${
                    kind === "wrong" ? "text-[#b13a22] line-through" : ""
                  }`}
                  style={{ fontFamily: HAND }}
                >
                  {g?.readAnswer}
                  {kind === "unsure" ? "?" : ""}
                  {kind === "correct" && (
                    <span className="ml-[3px] inline-block font-extrabold text-[#3f7d3a]">✓</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 text-[10.5px] text-[#7a6248]">
          … plus {key.questions.length - first.length} more questions on the sheet
        </div>
      </div>
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
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <BackButton onPress={onBack} />
      <ScreenHeader kicker="Practice Sheets" title={`${kid.name} · ${sheetLabel(sheet)}`} />
      <div className="rounded-[16px] border-[1.5px] border-dashed border-line bg-card px-[15px] py-[14px] text-center">
        <div className="mb-1.5 mt-2.5 text-[38px] leading-none text-tang">▤</div>
        <h3 className={`${H3} mb-1`}>Not started yet</h3>
        <p className="text-[13.5px] leading-[1.45] text-mid">
          {kid.name} hasn&rsquo;t done this sheet yet. When they finish it, scan it to get it
          marked.
        </p>
      </div>
      <button type="button" onClick={onScan} className={`${BTN} mt-3`}>
        Scan
      </button>
      <button
        type="button"
        onClick={() => showToast(`Saved: Grade ${kid.grade} · ${sheetLabel(sheet)} sheets (PDF)`)}
        className={`${BTN_SECONDARY} mt-2.5`}
      >
        Download sheet (PDF)
      </button>
    </div>
  );
}
