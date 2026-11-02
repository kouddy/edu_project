"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase-client";

/* The practice section under a Help page's lesson: the 5 practice
   questions generated and verified with the lesson, for the child
   to try on the spot. The slot polls the same guidance read as the
   animation; it renders only when the lesson is ready and carries
   practice questions — lessons generated before practice existed
   simply have none, and the page ends at the printable. Each
   question checks the typed answer against the stored one here on
   the device; the working behind each answer never leaves the
   server. */

interface PracticeItem {
  prompt: string;
  answer: string;
}

function answersMatch(input: string, answer: string): boolean {
  const clean = (s: string) => s.toLowerCase().trim().replace(/[$,\s]/g, "");
  if (clean(input) === clean(answer)) return true;
  // A bare number typed against an answer that carries a $ sign or
  // a unit ("$1.98", "26 cm"): compare the numbers themselves.
  const typed = input.trim().replace(/[$,]/g, "");
  if (!/^[+-]?[\d.]+$/.test(typed)) return false;
  const typedValue = parseFloat(typed);
  const stored = answer.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!stored || Number.isNaN(typedValue)) return false;
  return Math.abs(typedValue - parseFloat(stored[0])) < 0.011;
}

function PracticeQuestionRow({ index, item }: { index: number; item: PracticeItem }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "right" | "wrong">("idle");
  const [attempts, setAttempts] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const settled = state === "right" || revealed;

  const check = () => {
    if (settled || !value.trim()) return;
    if (answersMatch(value, item.answer)) {
      setState("right");
    } else {
      setState("wrong");
      setAttempts((n) => n + 1);
    }
  };

  return (
    <div className="mt-4">
      <div className="text-[14.5px] font-medium leading-snug text-ink">
        {index + 1}. {item.prompt}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (state === "wrong") setState("idle");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") check();
          }}
          disabled={settled}
          placeholder="Your answer"
          aria-label={`Your answer for practice question ${index + 1}`}
          className="min-w-0 flex-1 rounded-[10px] border-[1.5px] border-line bg-card px-3 py-[9px] text-[15px] text-ink outline-none placeholder:text-faint focus:border-tangdeep disabled:opacity-60"
        />
        {!settled && (
          <button
            type="button"
            onClick={check}
            className="shrink-0 rounded-full bg-filldark px-4 py-[8px] text-[13.5px] font-bold text-tangdeep"
          >
            Check
          </button>
        )}
      </div>
      {state === "right" && (
        <div className="mt-[6px] text-[13.5px] font-semibold text-tangdeep">That&rsquo;s right!</div>
      )}
      {state === "wrong" && !revealed && (
        <div className="mt-[6px] text-[13.5px] text-mid">
          Not quite — have another go.
          {attempts >= 2 && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="ml-2 font-semibold text-tangdeep underline"
            >
              See the answer
            </button>
          )}
        </div>
      )}
      {revealed && (
        <div className="mt-[6px] text-[13.5px] text-mid">
          The answer is <span className="font-semibold text-ink">{item.answer}</span>.
        </div>
      )}
    </div>
  );
}

export default function PracticeQuestions({
  printedCode,
  questionNumber,
}: {
  printedCode: string;
  questionNumber: number;
}) {
  const [practice, setPractice] = useState<PracticeItem[] | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
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
        if (!res.ok) return;
        const body = (await res.json()) as {
          status: string;
          practice?: PracticeItem[];
        };
        if (!live) return;
        if (body.status === "ready") {
          if (body.practice && body.practice.length > 0) setPractice(body.practice);
          return;
        }
        if (body.status === "failed") return;
        if (++polls <= 100) timer = setTimeout(poll, 3000);
      } catch {
        if (live) setResolved(true);
      }
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(fallback);
      if (timer) clearTimeout(timer);
    };
  }, [printedCode, questionNumber]);

  if (!resolved || !practice) return null;
  return (
    <>
      <div aria-hidden className="mt-[14px] border-t border-dashed border-linesoft" />
      <div className="mt-[10px] text-[15px] font-bold text-ink">Now you try</div>
      {practice.map((item, i) => (
        <PracticeQuestionRow key={i} index={i} item={item} />
      ))}
    </>
  );
}
