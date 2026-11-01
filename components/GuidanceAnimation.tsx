"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase-client";

/* The guidance slot under a wrong answer. A short animation is
   generated on the server after marking (never blocking it), and
   this slot polls for it. The slot renders nothing until the first
   poll answers: when the animation is already generated — the
   usual case on any revisit — the text guidance would otherwise
   paint for one poll cycle and then be replaced, a visible flash
   of content the child never needed. Once the state is known, the
   text guidance shows while generation runs (or for good, when
   generation has failed), and the animation swaps in when it is
   ready. The animation runs in a sandboxed frame — generated HTML
   gets no access to the app. */

const TEXT_BOX =
  "mt-[7px] whitespace-pre-line rounded-[9px] bg-[#fdebd0] px-2.5 py-2 text-[13px] leading-[1.45] text-ink";

interface GuidanceAnimationProps {
  printedCode: string;
  questionNumber: number;
  /** The question's text guidance, or null when it only restates the
   *  correct answer (that text is never shown on its own). */
  guidanceText: string | null;
}

export default function GuidanceAnimation({
  printedCode,
  questionNumber,
  guidanceText,
}: GuidanceAnimationProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    // If the first answer never comes back (a hung request), fall
    // back to the text rather than leaving the slot blank forever.
    const fallback = setTimeout(() => {
      if (live) setResolved(true);
    }, 8000);
    const poll = async () => {
      try {
        const token = await getAccessToken().catch(() => null);
        const res = await fetch(
          `/api/guidance/${encodeURIComponent(printedCode)}/${questionNumber}`,
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );
        if (!live) return;
        setResolved(true);
        if (!res.ok) {
          setPending(false);
          return;
        }
        const body = (await res.json()) as { status: string; html?: string };
        if (!live) return;
        if (body.status === "ready" && body.html) {
          setHtml(body.html);
          setPending(false);
          return;
        }
        if (body.status === "failed") {
          setPending(false);
          return;
        }
        // generating — the task may sit in a queue behind others,
        // so keep waiting up to ~5 minutes; anything later still
        // lands in History for the next visit.
        if (++polls <= 100) timer = setTimeout(poll, 3000);
        else setPending(false);
      } catch {
        if (live) {
          setResolved(true);
          setPending(false);
        }
      }
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(fallback);
      if (timer) clearTimeout(timer);
    };
  }, [printedCode, questionNumber]);

  if (html) {
    return (
      <iframe
        title="Watch how it works"
        sandbox="allow-scripts"
        srcDoc={html}
        className="mt-[10px] h-[380px] w-full rounded-[9px] bg-[#fff8ec]"
      />
    );
  }
  if (!resolved) return null;
  return (
    <>
      {guidanceText && <div className={TEXT_BOX}>{guidanceText}</div>}
      {pending && (
        <div className="mt-[5px] px-1 text-[12px] text-faint">
          A short animation for this one is on its way…
        </div>
      )}
    </>
  );
}
