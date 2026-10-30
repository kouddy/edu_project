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

/**
 * The two live grading pills: a green "correct/graded graded" pill and an
 * amber "N need your check" pill, collapsing to one "X/Y final" pill once
 * every unsure answer has been settled.
 */
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
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 mt-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-tangdeep">
        {kicker}
      </p>
      <h1 className="mb-1.5 font-display text-[23px] font-extrabold leading-[1.15] text-ink">
        {title}
      </h1>
      {sub && <p className="mb-3.5 text-[13.5px] leading-[1.45] text-mid">{sub}</p>}
    </div>
  );
}
