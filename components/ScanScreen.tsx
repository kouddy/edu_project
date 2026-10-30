"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface StagedPhoto {
  key: string;
  url: string;
}

interface Props {
  staged: StagedPhoto[];
  onAddBlobs: (blobs: Blob[]) => void;
  onRemoveAt: (index: number) => void;
  onGrade: () => void;
  onExit: () => void;
}

/* Styled directly from the wireframe's full-screen Scan (.scanfs,
   .camera.fullscreen corners, .camclose, .scan-bottom stack, gallery
   tile + orange shutter, cream .scan-grade bar, .preview-overlay).
   The wireframe's demo view / bad-photo demo are intentionally not
   carried over — this screen drives the real camera. */
const BTN =
  "block w-full rounded-[12px] border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[14px] py-[13px] text-center text-[15.5px] font-bold text-[#fff8ec] shadow-[0_3px_8px_rgba(199,91,0,0.28)]";
const BTN_SECONDARY =
  "block w-full rounded-[12px] border-[1.5px] border-line bg-card px-[14px] py-[13px] text-center text-[15.5px] font-bold text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
const CAMCLOSE =
  "flex h-[42px] w-[42px] items-center justify-center rounded-full border border-white/[0.38] bg-[rgba(20,12,6,0.58)] pb-0.5 text-[26px] leading-none text-white backdrop-blur-[6px]";

export default function ScanScreen({ staged, onAddBlobs, onRemoveAt, onGrade, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [camState, setCamState] = useState<"starting" | "on" | "unavailable">("starting");
  const [preview, setPreview] = useState<number | null>(null);

  const startCamera = useCallback(async () => {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      setCamState("unavailable");
      return;
    }
    setCamState("starting");
    try {
      const stream = await md.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCamState("on");
    } catch {
      if (mountedRef.current) setCamState("unavailable");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    startCamera();
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [startCamera]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || camState !== "on") return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1080;
    canvas.height = video.videoHeight || 1440;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) onAddBlobs([blob]);
      },
      "image/jpeg",
      0.85,
    );
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onAddBlobs([...files]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const closePreview = () => setPreview(null);
  const removeInPreview = () => {
    if (preview === null) return;
    onRemoveAt(preview);
    setPreview((p) => {
      if (p === null) return null;
      if (staged.length <= 1) return null;
      return Math.min(p, staged.length - 2);
    });
  };

  return (
    <div className="relative h-full overflow-hidden bg-[#1a120b] text-white">
      {/* camera / placeholder */}
      {camState !== "unavailable" && (
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {camState !== "on" && (
        <div
          className="absolute inset-0 bg-fill"
          style={{
            backgroundImage:
              "linear-gradient(rgba(180,110,40,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(180,110,40,.07) 1px,transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-5 text-center text-[13px] leading-snug text-faint">
            <span className="text-[26px]">▤</span>
            <span>
              Camera view
              <br />
              Line the sheet up inside the frame.
              <br />
              Flat, filling the frame, no flash glare.
            </span>
          </div>
        </div>
      )}

      {/* frame corners */}
      <span className="absolute left-4 top-16 h-[30px] w-[30px] rounded-tl-[8px] border-l-[3px] border-t-[3px] border-tangdeep opacity-85" />
      <span className="absolute right-4 top-16 h-[30px] w-[30px] rounded-tr-[8px] border-r-[3px] border-t-[3px] border-tangdeep opacity-85" />
      <span className="absolute bottom-[178px] left-4 h-[30px] w-[30px] rounded-bl-[8px] border-b-[3px] border-l-[3px] border-tangdeep opacity-85" />
      <span className="absolute bottom-[178px] right-4 h-[30px] w-[30px] rounded-br-[8px] border-b-[3px] border-r-[3px] border-tangdeep opacity-85" />

      {/* exit */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Close camera"
        className={`${CAMCLOSE} absolute left-3 top-3 z-20`}
      >
        ×
      </button>

      {camState === "starting" && (
        <button
          type="button"
          onClick={startCamera}
          className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[18px] py-[11px] text-[14.5px] font-bold text-[#fff8ec] shadow-[0_4px_14px_rgba(122,74,20,0.35)]"
        >
          Turn on camera
        </button>
      )}

      {/* bottom stack: controls → hint → tray → grade bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 bg-[linear-gradient(to_top,rgba(18,10,4,0.72)_0%,rgba(18,10,4,0.46)_62%,transparent_100%)] px-4 pb-4 pt-2.5">
        <div className="grid w-full max-w-[360px] grid-cols-[1fr_auto_1fr] items-start">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Upload Photo"
            className="flex max-w-[76px] flex-col items-center gap-[5px] justify-self-start px-0.5 py-0.5 text-white"
          >
            <span className="flex h-[50px] w-[50px] items-center justify-center rounded-[12px] border-[1.5px] border-line bg-[rgba(255,249,239,0.97)] text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="block h-[26px] w-[26px]"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="9" cy="9" r="1.6" />
                <path d="M21 15.5 16.5 11 9 18.5" />
              </svg>
            </span>
            <span className="text-center text-[11.5px] font-bold leading-[1.15] [text-shadow:0_1px_4px_rgba(0,0,0,0.65)]">
              Upload Photo
            </span>
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={camState !== "on"}
            aria-label="Take photo"
            className="flex h-[72px] w-[72px] items-center justify-center justify-self-center rounded-full border-2 border-white/90 bg-[rgba(255,253,247,0.96)] shadow-[0_4px_14px_rgba(0,0,0,0.38)] disabled:opacity-40"
          >
            <span className="h-[58px] w-[58px] rounded-full bg-tang shadow-[inset_0_0_0_3px_rgba(255,248,236,0.45)]" />
          </button>
          <span className="w-[50px] justify-self-end" aria-hidden="true" />
        </div>

        <span className="text-[12.5px] font-semibold text-white/[0.94] [text-shadow:0_1px_4px_rgba(0,0,0,0.65)]">
          Tap to capture
        </span>

        {staged.length > 0 && (
          <div
            className="tray-scroll flex w-full items-start gap-3 overflow-x-auto px-2 pb-1 pt-1"
            aria-label="Photos ready to grade"
          >
            {staged.map((p, i) => (
              <div key={p.key} className="relative shrink-0">
                <button type="button" onClick={() => setPreview(i)} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`Staged sheet photo ${i + 1}`}
                    className="h-14 w-14 rounded-[12px] border-[1.5px] border-line bg-[#fff8ec] object-cover shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]"
                  />
                </button>
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => onRemoveAt(i)}
                  className="absolute -right-[7px] -top-[7px] z-[2] flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-card bg-ink pb-px text-[15px] font-extrabold leading-none text-[#fff9ef] shadow-[0_2px_6px_rgba(61,43,31,0.35)]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {staged.length > 0 && (
          <div className="grain-surface -mx-4 -mb-4 mt-1.5 self-stretch border-t-[1.5px] border-linesoft bg-[#fff9ef] px-[18px] pb-[14px] pt-3 shadow-[0_-6px_16px_rgba(0,0,0,0.22)]">
            <button type="button" onClick={onGrade} className={BTN}>
              Grade {staged.length} sheet{staged.length === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* full-screen preview */}
      <AnimatePresence>
        {preview !== null && staged[preview] && (
          <PreviewOverlay
            url={staged[preview].url}
            index={preview}
            total={staged.length}
            onClose={closePreview}
            onPrev={() => setPreview((p) => (p === null ? p : Math.max(0, p - 1)))}
            onNext={() => setPreview((p) => (p === null ? p : Math.min(staged.length - 1, p + 1)))}
            onRemove={removeInPreview}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* The wireframe's staged-photo preview: dark overlay, × close, count
   pill, clamped arrows, pinch / double-tap zoom with drag pan, swipe
   to switch, Remove + Back at the bottom. */
function PreviewOverlay({
  url,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onRemove,
}: {
  url: string;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRemove: () => void;
}) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startDist: 0, startScale: 1, lastX: 0, lastY: 0, swipeX: 0 });

  useEffect(() => {
    setView({ s: 1, x: 0, y: 0 });
    pointers.current.clear();
  }, [index, url]);

  const dist = () => {
    const pts = [...pointers.current.values()];
    return pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current.lastX = e.clientX;
      gesture.current.lastY = e.clientY;
      gesture.current.swipeX = e.clientX;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      gesture.current.startDist = dist();
      setView((v) => {
        gesture.current.startScale = v.s;
        return v;
      });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && gesture.current.startDist > 0) {
      const s = Math.min(4, Math.max(1, gesture.current.startScale * (dist() / gesture.current.startDist)));
      setView((v) => ({ ...v, s, x: s === 1 ? 0 : v.x, y: s === 1 ? 0 : v.y }));
    } else if (pointers.current.size === 1) {
      const dx = e.clientX - gesture.current.lastX;
      const dy = e.clientY - gesture.current.lastY;
      gesture.current.lastX = e.clientX;
      gesture.current.lastY = e.clientY;
      setView((v) => (v.s > 1 ? { ...v, x: v.x + dx, y: v.y + dy } : v));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (wasSingle && view.s === 1) {
      const dx = e.clientX - gesture.current.swipeX;
      if (dx < -60) onNext();
      else if (dx > 60) onPrev();
    }
    if (pointers.current.size === 0) {
      setView((v) => (v.s <= 1.02 ? { s: 1, x: 0, y: 0 } : v));
    }
  };

  const onDoubleClick = () => {
    setView((v) => (v.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.2, x: 0, y: 0 }));
  };

  const arrowCls =
    "absolute top-1/2 z-[32] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.38] bg-[rgba(20,12,6,0.62)] pb-[3px] text-[26px] leading-none text-white backdrop-blur-[6px] disabled:pointer-events-none disabled:opacity-35";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex flex-col bg-[#0d0805]"
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className={`${CAMCLOSE} absolute left-3 top-3 z-[32]`}
      >
        ×
      </button>
      {total > 1 && (
        <span className="absolute left-1/2 top-4 z-[32] -translate-x-1/2 rounded-full border border-white/25 bg-[rgba(20,12,6,0.58)] px-[11px] py-1.5 text-[12.5px] font-bold tracking-[0.04em] text-white backdrop-blur-[6px]">
          {index + 1} / {total}
        </span>
      )}
      <div
        className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden px-[14px] py-[18px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
            transformOrigin: "center center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Your staged photo, full size"
            draggable={false}
            className="pointer-events-none block max-h-full max-w-full rounded-[6px] bg-[#fff8ec] object-contain shadow-[0_10px_34px_rgba(0,0,0,0.5)]"
          />
        </div>
        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              disabled={index === 0}
              onClick={onPrev}
              className={`${arrowCls} left-3`}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next photo"
              disabled={index === total - 1}
              onClick={onNext}
              className={`${arrowCls} right-3`}
            >
              ›
            </button>
          </>
        )}
      </div>
      <div className="flex flex-col gap-[9px] border-t border-white/[0.14] bg-[rgba(13,8,5,0.96)] px-4 pb-4 pt-2.5">
        <p className="text-center text-[12px] leading-[1.4] text-white/[0.72]">
          Pinch to zoom · Double-tap to zoom in or out{total > 1 ? " · Swipe to switch photos" : ""}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-[#ff8a70] bg-[rgba(210,73,43,0.16)] px-[14px] py-[13px] text-[15.5px] font-extrabold text-[#ffb4a3]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-[19px] w-[19px] shrink-0"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
          Remove photo
        </button>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Back
        </button>
      </div>
    </motion.div>
  );
}
