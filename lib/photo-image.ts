/**
 * lib/photo-image.ts — photo sizing for staged sheet photos.
 *
 * Phone cameras produce far more pixels than the grader needs: a
 * 4032px photo measurably slows every grading call (bigger upload,
 * bigger model ingest) and a batch of them can exceed the server's
 * total payload guard. Staged photos are capped at a 2000px long edge
 * — the size the live grading tests were proven at — before they are
 * stored, so the tray, the stored copy and every grading resend use
 * the same smaller file. Photos already small enough pass through
 * untouched, and any decode failure keeps the original blob (the
 * grader, not the sizer, is the judge of a bad photo).
 */

/** Longest edge a staged photo may keep, in pixels. */
export const MAX_PHOTO_EDGE = 2000;

export async function downscalePhoto(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith("image/")) return blob;
  let bitmap: ImageBitmap;
  try {
    // "from-image" bakes the camera's EXIF orientation into the pixels,
    // so the stored photo is upright however it was held.
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    return blob;
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_PHOTO_EDGE) {
    bitmap.close();
    return blob;
  }
  const scale = MAX_PHOTO_EDGE / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blob;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => {
    canvas.toBlob((out) => resolve(out ?? blob), "image/jpeg", 0.85);
  });
}
