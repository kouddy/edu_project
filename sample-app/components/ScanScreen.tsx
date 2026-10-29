"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@heroui/react";
import { IconChevronLeft, IconChevronRight, IconX } from "./ui";

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

export default function ScanScreen({ staged, onAddBlobs, onRemoveAt, onGrade, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [camState, setCamState] = useState<"starting" | "on" | "unavailable">("starting");
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let live = true;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      setCamState("unavailable");
      return;
    }
    md.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (!live) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setCamState("on");
      })
      .catch(() => {
        if (live) setCamState("unavailable");
      });
    return () => {
      live = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
    <div className="relative flex h-full flex-col bg-black text-white">
      {/* camera / fallback */}
      {camState !== "unavailable" ? (
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#241a10] p-8">
          <div className="flex h-[62%] w-full max-w-[300px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/35 px-6 text-center">
            <span className="text-[30px]">▤</span>
            <p className="text-[15px] font-bold">Camera isn&rsquo;t available here</p>
            <p className="text-[13px] leading-snug text-white/70">
              You can still add a photo of the finished sheet instead.
            </p>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/45" />

      {/* exit */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Close scan"
        className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
      >
        <IconX size={20} />
      </button>

      {/* bottom stack: tray → controls → grade */}
      <div className="relative z-10 mt-auto">
        {staged.length > 0 && (
          <div className="flex gap-2.5 overflow-x-auto px-4 pb-3">
            {staged.map((p, i) => (
              <div key={p.key} className="relative shrink-0">
                <button type="button" onClick={() => setPreview(i)} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`Staged sheet photo ${i + 1}`}
                    className="h-14 w-14 rounded-xl border-2 border-white/80 object-cover"
                  />
                </button>
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => onRemoveAt(i)}
                  className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white"
                >
                  <IconX size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center px-5 pb-4">
          <div className="flex flex-1 justify-start">
            <Button
              variant="secondary"
              size="md"
              onPress={() => fileRef.current?.click()}
              className="bg-white/15 font-bold text-white backdrop-blur-sm"
            >
              Upload Photo
            </Button>
          </div>
          <button
            type="button"
            onClick={capture}
            disabled={camState !== "on"}
            aria-label="Take photo"
            className="h-[68px] w-[68px] shrink-0 rounded-full border-4 border-white bg-white/25 transition active:bg-white/50 disabled:opacity-40"
          />
          <div className="flex-1" />
        </div>

        {staged.length > 0 && (
          <div className="bg-black/50 px-4 pb-6 pt-3 backdrop-blur-sm">
            <Button size="lg" fullWidth onPress={onGrade} className="font-extrabold">
              Grade {staged.length} sheet{staged.length === 1 ? "" : "s"}
            </Button>
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col bg-black/95"
          >
            <div className="flex items-center px-4 py-3">
              <button
                type="button"
                onClick={closePreview}
                aria-label="Close preview"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <IconX size={20} />
              </button>
              <p className="flex-1 text-center text-[14px] font-bold text-white/85">
                {preview + 1} / {staged.length}
              </p>
              <span className="w-10" />
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={staged[preview].url}
                alt="Staged sheet photo, full size"
                className="max-h-full max-w-full rounded-lg object-contain"
              />
              {staged.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => setPreview((preview - 1 + staged.length) % staged.length)}
                    className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white"
                  >
                    <IconChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => setPreview((preview + 1) % staged.length)}
                    className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white"
                  >
                    <IconChevronRight size={20} />
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2.5 p-4 pb-6">
              <Button
                variant="danger"
                size="lg"
                fullWidth
                onPress={removeInPreview}
                className="font-bold"
              >
                Remove photo
              </Button>
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onPress={closePreview}
                className="bg-white/15 font-bold text-white"
              >
                Keep photo
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
