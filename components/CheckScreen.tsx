"use client";

import { useEffect, useState } from "react";
import { sheetLabel, type CheckItem, type Snapshot } from "@/lib/derive";
import { getPhoto, type Sheet } from "@/lib/store";
import { BackButton, ScreenHeader } from "./ui";
import PhotoViewer from "./PhotoViewer";

interface Props {
  snap: Snapshot;
  items: CheckItem[];
  from: "home" | "results";
  onBack: () => void;
  onDone: () => void;
  onResolve: (item: CheckItem, resolution: "correct" | "wrong") => void;
}

/* Styled directly from the wireframe's Parent check (.card, .btn,
   .progressdots) — one question at a time, like the wireframe, over
   the app's consolidated cross-kid queue. The wireframe's dashed
   "zoomed answer" box is only the no-photo fallback here: when the
   submission has the real uploaded photo, that is what shows. */
const CARD =
  "rounded-[16px] border-[1.5px] border-linesoft bg-card px-[15px] py-[14px] shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
const H3 = "font-display text-[15.5px] font-extrabold text-ink";
const BTN =
  "block w-full rounded-[12px] border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[14px] py-[13px] text-center text-[15.5px] font-bold text-[#fff8ec] shadow-[0_3px_8px_rgba(199,91,0,0.28)]";
const BTN_SECONDARY =
  "block w-full rounded-[12px] border-[1.5px] border-line bg-card px-[14px] py-[13px] text-center text-[15.5px] font-bold text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";

export default function CheckScreen({ snap, items, from, onBack, onDone, onResolve }: Props) {
  const [resolved, setResolved] = useState<
    { item: CheckItem; resolution: "correct" | "wrong" }[]
  >([]);
  const item = items[0];
  const total = items.length + resolved.length;

  /* The real uploaded photo for the current item — the parent checks
     our read against the actual sheet. Sheets graded from seeds have
     no photo; those fall back to the wireframe's dashed box. */
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoOpen, setPhotoOpen] = useState(false);
  const photoKeysSig = (item?.photoKeys ?? []).join(",");
  useEffect(() => {
    let urls: string[] = [];
    let live = true;
    setPhotoOpen(false);
    if (photoKeysSig) {
      Promise.all(photoKeysSig.split(",").map((k) => getPhoto(k).catch(() => null)))
        .then((blobs) => {
          if (!live) return;
          urls = blobs.filter((b): b is Blob => !!b).map((b) => URL.createObjectURL(b));
          setPhotoUrls(urls);
        })
        .catch(() => {});
    } else {
      setPhotoUrls([]);
    }
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photoKeysSig]);

  const resolve = (resolution: "correct" | "wrong") => {
    if (!item) return;
    setResolved((prev) => [...prev, { item, resolution }]);
    onResolve(item, resolution);
  };

  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <BackButton onPress={onBack} />
      <ScreenHeader
        kicker="Practice Sheets"
        title="Parent check"
        sub="We never guess. If we can’t read an answer, you settle it — it takes seconds."
      />

      {!item && resolved.length === 0 && (
        <div className={`${CARD} text-center`}>
          <div className="mb-1.5 mt-2.5 text-[38px] leading-none text-tang">✓</div>
          <h3 className={`${H3} mb-1`}>All checked — nice work</h3>
          <p className="text-[13.5px] leading-[1.45] text-mid">Nothing needs your check right now.</p>
        </div>
      )}

      {!item && resolved.length > 0 && (
        <CompletionCard snap={snap} resolved={resolved} onDone={onDone} />
      )}

      {item && (
        <>
          <p className="mb-3 text-center text-[13px] font-semibold tracking-[0.05em] text-mid">
            {resolved.length + 1} of {total}
          </p>
          <div className={CARD}>
            <h3 className={`${H3} mb-1`}>
              {item.kid.name} · {shortLabel(item.sheet)} · Q{item.questionNumber}
            </h3>
            <p className="mb-2.5 text-[13.5px] leading-[1.45] text-mid [&_strong]:text-ink">
              <strong>{item.prompt}</strong> &nbsp;·&nbsp; Correct answer:{" "}
              <strong>{item.correctAnswer}</strong>
            </p>
            {photoUrls.length > 0 ? (
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                aria-label="View the photo full size"
                className="relative block w-full overflow-hidden rounded-[12px] border-[1.5px] border-line bg-[#fdfcf6]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrls[0]}
                  alt={`${item.kid.name}'s sheet, as uploaded`}
                  className="block h-[210px] w-full object-contain"
                />
                <span
                  className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-[15px] leading-none text-white"
                  aria-hidden
                >
                  ⤢
                </span>
              </button>
            ) : (
              <div className="flex h-[170px] flex-col items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-dashed border-line bg-fill bg-[repeating-linear-gradient(transparent,transparent_23px,rgba(180,110,40,0.10)_24px)] px-[14px] py-[14px] text-center">
                <span className="text-[14px] text-mid">
                  {item.kid.name}&rsquo;s answer, zoomed from the photo
                </span>
                <span className="text-[34px] font-bold leading-none tracking-[0.04em] text-ink">
                  {(item.readAnswer ?? "?").split("").join(" ")}
                </span>
              </div>
            )}
            {photoOpen && photoUrls.length > 0 && (
              <PhotoViewer urls={photoUrls} kidName={item.kid.name} onClose={() => setPhotoOpen(false)} />
            )}
            <p className="mt-2.5 text-[13.5px] leading-[1.45] text-mid [&_strong]:text-ink">
              {item.readAnswer ? (
                <>
                  We think this looks like &ldquo;{item.readAnswer}&rdquo;. Was {item.kid.name}
                  &rsquo;s final answer <strong>{item.correctAnswer}</strong>?
                </>
              ) : (
                <>
                  We couldn&rsquo;t read this answer at all. Was {item.kid.name}&rsquo;s final
                  answer <strong>{item.correctAnswer}</strong>?
                </>
              )}
            </p>
            <div className="mt-[13px] flex gap-2.5">
              <button type="button" onClick={() => resolve("correct")} className={`${BTN} flex-1`}>
                It was correct
              </button>
              <button
                type="button"
                onClick={() => resolve("wrong")}
                className={`${BTN_SECONDARY} flex-1`}
              >
                It was wrong
              </button>
            </div>
          </div>
          <p className="mt-3 text-center">
            <button
              type="button"
              onClick={onBack}
              className="px-1 py-1.5 text-[13px] font-semibold text-tangdeep underline underline-offset-[3px]"
            >
              Finish later — back to {from === "results" ? "results" : "Home"}
            </button>
          </p>
        </>
      )}
    </div>
  );
}

function shortLabel(sheet: Sheet): string {
  return sheetLabel(sheet).replaceAll(" · ", " ");
}

function CompletionCard({
  snap,
  resolved,
  onDone,
}: {
  snap: Snapshot;
  resolved: { item: CheckItem; resolution: "correct" | "wrong" }[];
  onDone: () => void;
}) {
  const sheetIds = [...new Set(resolved.map((r) => r.item.sheet.id))];
  const kidName = resolved[0]?.item.kid.name ?? "";
  const q9Wrong = resolved.some(
    (r) => r.item.questionNumber === 9 && r.resolution === "wrong",
  );

  return (
    <div className={`${CARD} text-center`}>
      <div className="mb-1.5 mt-2.5 text-[38px] leading-none text-tang">✓</div>
      <h3 className={`${H3} mb-1`}>All checked — nice work</h3>
      {sheetIds.map((sheetId) => {
        const st = snap.states.get(sheetId);
        if (!st?.score) return null;
        return (
          <div key={sheetId}>
            <p className="text-[13.5px] leading-[1.45] text-mid">
              Final score for {shortLabel(st.sheet)}:
            </p>
            <p className="my-2 text-[26px] font-bold leading-none text-ink">
              {st.score.finalCorrect}/{st.score.total}
            </p>
          </div>
        );
      })}
      <p className="text-[13.5px] leading-[1.45] text-mid">
        {q9Wrong
          ? `Q9 marked wrong — recorded in ${kidName}’s progress.`
          : `All results are recorded in ${kidName}’s progress.`}
      </p>
      <button type="button" onClick={onDone} className={`${BTN} mt-[13px]`}>
        Back to Home
      </button>
    </div>
  );
}
