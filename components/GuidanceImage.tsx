"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase-client";
import { BTN_SECONDARY } from "./ui";

/* The guidance-image slot under the Help page's animation: a
   printable guidance image for the question (the lesson's method
   laid out as 4 to 6 steps), drawn on the server from the
   question's finished lesson. The slot renders nothing until the
   first poll answers, shows a quiet waiting line while the image
   is drawn, and stays empty when generation failed — the page
   already carries the text and the animation either way. The
   image itself is never displayed: it is a printout, so a ready
   image offers only a Download button. */

interface GuidanceImageProps {
  printedCode: string;
  questionNumber: number;
}

export default function GuidanceImage({ printedCode, questionNumber }: GuidanceImageProps) {
  const [image, setImage] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
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
          `/api/guidance-image/${encodeURIComponent(printedCode)}/${questionNumber}`,
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );
        if (!live) return;
        setResolved(true);
        if (!res.ok) {
          setPending(false);
          return;
        }
        const body = (await res.json()) as { status: string; image?: string };
        if (!live) return;
        if (body.status === "ready" && body.image) {
          setImage(body.image);
          setPending(false);
          return;
        }
        if (body.status === "failed") {
          setPending(false);
          return;
        }
        // Drawing the image can take a while; keep waiting up to
        // ~5 minutes like the animation slot.
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

  if (!resolved) return null;
  if (!image && !pending) return null;
  const ext = image?.startsWith("data:image/png") ? "png" : image?.startsWith("data:image/jpeg") ? "jpg" : "webp";
  // The download is named by the sheet code and question number —
  // the image's own identity, the same one its cache and database
  // row use. The topic title is printed on the image itself, so it
  // does not need to ride in the file name too.
  const codeSlug = printedCode
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (
    <>
      <div aria-hidden className="mt-[14px] border-t border-dashed border-linesoft" />
      {image ? (
        <>
          <div className="mt-[10px] px-1 text-[13px] text-mid">
            A printable for this topic is ready — save it and print it.
          </div>
          <a href={image} download={`printable-${codeSlug}-q${questionNumber}.${ext}`} className={`${BTN_SECONDARY} mt-2`}>
            Download the printable
          </a>
        </>
      ) : (
        <div className="mt-[10px] px-1 text-[12px] text-faint">
          A printable for this topic is on its way…
        </div>
      )}
    </>
  );
}
