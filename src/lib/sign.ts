import crypto from "node:crypto";

function secret(): string {
  return process.env.PHOTO_URL_SECRET ?? "dev-only-secret-change-me";
}

/** Create a short-lived signed path like /api/photos/<file>?exp=..&sig=.. */
export function signPhotoUrl(file: string, ttlSeconds = 15 * 60): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac("sha256", secret())
    .update(`${file}:${exp}`)
    .digest("hex");
  return `/api/photos/${encodeURIComponent(file)}?exp=${exp}&sig=${sig}`;
}

export function verifyPhotoSignature(
  file: string,
  exp: string | null,
  sig: string | null
): boolean {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() / 1000) return false;
  const expected = crypto
    .createHmac("sha256", secret())
    .update(`${file}:${expNum}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
