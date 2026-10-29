"use client";

/** Shared bits: small stroke icons, the Results score badges, Back button. */

import { Chip } from "@heroui/react";
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

export function IconDownload({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

export function IconX({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function IconChevronLeft({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  );
}

export function IconChevronRight({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m10 6 6 6-6 6" />
    </svg>
  );
}

/** Verdict icons for the question-by-question list. */
export function VerdictIcon({ kind }: { kind: "correct" | "wrong" | "unsure" }) {
  if (kind === "correct") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf text-white">
        <svg {...base(15)}>
          <path d="m4.5 12.5 5 5 10-11" />
        </svg>
      </span>
    );
  }
  if (kind === "wrong") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose text-white">
        <svg {...base(14)}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amberish font-extrabold text-ink">
      ?
    </span>
  );
}

/**
 * The two live grading pills: a green "correct/graded graded" pill and an
 * amber "N need your check" pill, collapsing to one "X/Y final" pill once
 * every unsure answer has been settled.
 */
export function ScoreBadges({ score, align = "end" }: { score: ScoreSummary; align?: "end" | "start" }) {
  if (score.isFinal) {
    return (
      <div className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}>
        <Chip color="success" variant="primary" size="md" className="font-bold">
          {score.finalCorrect}/{score.total} final
        </Chip>
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-1.5 ${align === "end" ? "items-end" : "items-start"}`}>
      <Chip color="success" variant="soft" size="sm" className="font-bold">
        {score.correct}/{score.graded} graded
      </Chip>
      {score.unsure > 0 && (
        <Chip color="warning" variant="soft" size="sm" className="font-bold">
          {score.unsure} need your check
        </Chip>
      )}
    </div>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="-ml-1 inline-flex items-center gap-0.5 py-1 pr-3 text-[15px] font-bold text-tangdeep"
    >
      <IconChevronLeft size={19} />
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
    <div className="mb-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-tang">{kicker}</p>
      <h1 className="mt-0.5 text-[28px] font-extrabold leading-tight text-ink">{title}</h1>
      {sub && <p className="mt-0.5 text-[14px] text-mid">{sub}</p>}
    </div>
  );
}
