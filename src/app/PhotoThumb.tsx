"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@heroui/react";
import { store } from "@/lib/browser-store";

/**
 * Renders a photo by loading its bytes back from local storage (IndexedDB)
 * through the data layer. Shows a spinner while loading, nothing if missing.
 */
export default function PhotoThumb({
  photoId,
  alt,
  className,
}: {
  photoId: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    let objectUrl: string | null = null;
    (async () => {
      const blob = await store.getPhoto(photoId);
      if (!live) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (missing) {
    return (
      <span className="text-sm text-default-400">Photo unavailable</span>
    );
  }
  if (!url) {
    return (
      <span className="flex items-center gap-2 py-4 text-sm text-default-500">
        <Spinner size="sm" /> Loading photo…
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className ?? "max-h-40 rounded-lg border border-divider object-contain"}
    />
  );
}
