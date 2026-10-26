import { Chip } from "@heroui/react";
import type { GradedResult, QuestionVerdict } from "@/lib/product-types";

const VERDICT_STYLE: Record<QuestionVerdict, { label: string; color: "success" | "danger" | "warning" }> = {
  correct: { label: "Correct", color: "success" },
  incorrect: { label: "Check this", color: "danger" },
  unsure: { label: "Unsure", color: "warning" },
};

/** Per-question grading results. Data only — pass a GradedResult from the store. */
export default function GradeResults({ result }: { result: GradedResult }) {
  const decisive = result.perQuestion.filter((q) => q.verdict !== "unsure");
  const correct = result.perQuestion.filter((q) => q.verdict === "correct").length;
  const unsure = result.perQuestion.length - decisive.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-default-600">
        <span className="text-xl font-extrabold text-foreground">
          {correct} of {decisive.length} correct
        </span>
        {unsure > 0 ? (
          <span>
            {" "}
            · {unsure} left unsure for you to check
          </span>
        ) : null}
      </p>
      <ul className="flex flex-col gap-2">
        {result.perQuestion.map((q) => {
          const style = VERDICT_STYLE[q.verdict];
          return (
            <li
              key={q.questionNumber}
              className="flex flex-col gap-1 rounded-xl border border-divider px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold">
                  Q{q.questionNumber}
                  {q.modelReading ? (
                    <span className="font-normal text-default-600">
                      {" "}
                      · read “{q.modelReading}”
                    </span>
                  ) : null}
                </span>
                <Chip size="sm" variant="flat" color={style.color}>
                  {style.label}
                </Chip>
              </div>
              {q.explanation ? (
                <p className="text-[15px] leading-relaxed text-default-600">
                  {q.explanation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
