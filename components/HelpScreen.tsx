"use client";

import { promptForDisplay, sheetLabel, type SheetState } from "@/lib/derive";
import { BackButton, BTN_SECONDARY, ScreenHeader } from "./ui";
import GuidanceAnimation from "./GuidanceAnimation";
import GuidanceImage from "./GuidanceImage";
import PracticeQuestions from "./PracticeQuestions";

/* The help page for one wrong answer, reached from the Results
   "Help me" button: a focused view for working through the miss
   together — the question and what the kid wrote, the text
   guidance, and the animated lesson under it. Text and animation
   sit together here (in the Results list the animation replaced
   the text for lack of room; on its own page both earn their
   place). Generation still starts when the sheet is marked, so the
   animation is usually ready or nearly; the animation slot polls
   and arrives when it lands. The page itself is the surface — no
   card wraps the lesson, so the panels the child sees are only
   the ones carrying content: the tinted explanation and the
   animation's own layout. */

const TEXT_BOX =
  "mt-3 whitespace-pre-line rounded-[9px] bg-[#fdebd0] px-2.5 py-2 text-[13px] leading-[1.45] text-ink";

interface HelpProps {
  st: SheetState;
  questionNumber: number;
  /** The next wrong question on this sheet, when there is one. */
  onNext?: () => void;
  onBack: () => void;
}

export default function HelpScreen({ st, questionNumber, onNext, onBack }: HelpProps) {
  const { sheet, kid, key, result } = st;
  if (!result || !key) return null;
  const q = key.questions.find((x) => x.number === questionNumber);
  const g = result.perQuestion.find((x) => x.questionNumber === questionNumber);
  if (!q || !g) return null;

  const guidance = g.meta?.guidance ?? q.explanation;
  // The generic explanation only restates the correct answer, which
  // has its own line below — never shown on its own.
  const guidanceText =
    guidance === `The correct answer is ${q.correctAnswer}.` ? null : guidance;

  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <BackButton onPress={onBack} />
      <ScreenHeader
        title={sheet.topic}
        sub={`Question ${q.number} · ${kid.name} · ${sheetLabel(sheet)}`}
      />

      <div className="text-[15.5px] font-semibold leading-snug text-ink">
        {promptForDisplay(q.prompt, q.correctAnswer)}
      </div>
      <div className="mt-[3px] text-[13.5px] text-mid">
        {g.meta?.noAnswer ? "No answer written." : `${kid.name} wrote ${g.readAnswer}`}
      </div>
      <div className="mt-[1px] text-[13.5px] text-mid">
        Correct answer: <span className="font-semibold text-ink">{q.correctAnswer}</span>
      </div>

      {guidanceText && <div className={TEXT_BOX}>{guidanceText}</div>}

      {/* A divider marks where the lesson starts, set apart from
          the question and marking lines above it. */}
      <div aria-hidden className="mt-[14px] border-t border-dashed border-linesoft" />

      {/* The animation slot: text lives above it on this page, so
          the slot carries only the waiting line and, when ready,
          the animation itself. */}
      <GuidanceAnimation
        printedCode={sheet.printedCode}
        questionNumber={q.number}
        guidanceText={null}
      />

      {/* The printable guidance image for this question's topic,
          under the animation: it is the take-away form of the same
          help — print it, and the practice section is a worksheet. */}
      <GuidanceImage printedCode={sheet.printedCode} questionNumber={q.number} topic={q.topic ?? sheet.topic} />

      {/* The lesson's own practice questions, for the child to try
          on the spot and check right here. Renders only when the
          lesson carries a set. */}
      <PracticeQuestions printedCode={sheet.printedCode} questionNumber={q.number} />

      {onNext && (
        <button type="button" onClick={onNext} className={`${BTN_SECONDARY} mt-3`}>
          Next one to practise ›
        </button>
      )}
    </div>
  );
}
