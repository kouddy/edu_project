"use client";

import { useEffect } from "react";

/* Full-screen viewer for a submission's uploaded photos: the whole
   photo, uncropped, at the largest size the screen allows. List
   thumbnails are only for recognition — this is where a parent
   actually reads the sheet. Shared by Results and Parent check. */
export default function PhotoViewer({
  urls,
  kidName,
  onClose,
}: {
  urls: string[];
  kidName: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`Photos of ${kidName}'s sheet`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        className="fixed right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-[17px] font-bold leading-none text-white"
      >
        ✕
      </button>
      <div
        className="mx-auto flex min-h-full w-full max-w-[480px] flex-col items-center justify-center gap-3 px-3 py-14"
        onClick={onClose}
      >
        {urls.map((u, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={u}
            src={u}
            alt={`Your photo of ${kidName}'s sheet${urls.length > 1 ? ` (${i + 1} of ${urls.length})` : ""}`}
            className="block h-auto w-full rounded-[8px]"
            onClick={(e) => e.stopPropagation()}
          />
        ))}
      </div>
    </div>
  );
}
