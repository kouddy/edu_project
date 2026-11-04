"use client";

/** Shared bits: small stroke icons, the Results score badges, Back button. */

import type { ScoreSummary } from "@/lib/store";

type IconProps = { size?: number; className?: string };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconHome({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function IconScan({ size = 30, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 8V5a2 2 0 0 1 2-2h3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M3 12h18" />
    </svg>
  );
}

export function IconUser({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
    </svg>
  );
}

export function IconCheck({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

/**
 * The two live grading pills: a green "correct/graded graded" pill and an
 * amber "N need your check" pill, collapsing to one "X/Y final" pill once
 * every unsure answer has been settled.
 */
/* The two full-width button styles, defined once: the solid
   primary and the card secondary. Screens compose layout extras
   at the call site (margins, flex) but never restyle — a button
   doing the same kind of job looks the same on every screen. */
export const BTN =
  "block w-full rounded-[12px] border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[14px] py-[13px] text-center text-[15.5px] font-bold text-[#fff8ec] shadow-[0_3px_8px_rgba(199,91,0,0.28)]";
export const BTN_SECONDARY =
  "block w-full rounded-[12px] border-[1.5px] border-line bg-card px-[14px] py-[13px] text-center text-[15.5px] font-bold text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";

/* The card surface, defined once: every card in the app shares
   this radius, border, fill and shadow. A content card composes
   CARD_PAD for the standard inset; a list shell composes nothing
   and its rows carry the row inset (17px sides, 11px top/bottom,
   titles at the content inset). The gap below a card belongs to
   the stack, never the card: mb-3 at the call site, or a flex
   gap-3 stack. */
export const CARD =
  "rounded-[16px] border-[1.5px] border-linesoft bg-card shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
export const CARD_PAD = "px-[15px] py-[14px]";

/* The wireframe's .pill set: solid orange for a final score, green
   "correct/graded graded" and amber "N need your check" while checks
   are outstanding. */
const PILL =
  "inline-block rounded-full border-[1.5px] px-2.5 py-[3px] text-[12px] font-bold leading-tight";

export function ScoreBadges({ score, align = "end" }: { score: ScoreSummary; align?: "end" | "start" }) {
  if (score.isFinal) {
    return (
      <div className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}>
        <span className={`${PILL} border-tangdeep bg-tang text-[#fff8ec]`}>
          {score.finalCorrect}/{score.total} final
        </span>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-1.5 ${align === "end" ? "items-end" : "items-start"}`}>
      <span className={`${PILL} border-leaf bg-leaf text-[#fff8ec]`}>
        {score.correct}/{score.graded} graded
      </span>
      {score.unsure > 0 && (
        <span className={`${PILL} border-[#d98a06] bg-[#f0a30c] text-[#402a12]`}>
          {score.unsure} need your check
        </span>
      )}
    </div>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="inline-flex items-center gap-[3px] py-1.5 pr-2 text-[14.5px] font-bold leading-none text-tangdeep"
    >
      <span className="text-[17px] leading-none">‹</span>
      Back
    </button>
  );
}

export function ScreenHeader({
  title,
  sub,
}: {
  title: string;
  sub?: string;
}) {
  return (
    <div>
      <h1 className="mb-1.5 font-display text-[23px] font-extrabold leading-[1.15] text-ink">
        {title}
      </h1>
      {sub && <p className="mb-3.5 text-[13.5px] leading-[1.45] text-mid">{sub}</p>}
    </div>
  );
}
