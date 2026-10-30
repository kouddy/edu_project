import type { AccountState } from "./account-contract";
import { getPhoto, replaceServerBundle, savePhotoAs } from "./store";
import { getAccessToken } from "./supabase-client";

// Live-mode sync: pull the signed-in parent's account state from the
// server and mirror it into the live database, then fetch any stored
// sheet photos this device does not have yet. The server is the source
// of truth; a sync can run any time and simply overwrites the mirror.

export async function syncLiveAccount(): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  let state: AccountState;
  try {
    const res = await fetch("/api/account", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    state = (await res.json()) as AccountState;
  } catch {
    return false;
  }
  replaceServerBundle(state);
  for (const photo of state.photos) {
    try {
      if (await getPhoto(photo.key)) continue;
      const res = await fetch(`/api/account/photos/${photo.blobId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) continue;
      await savePhotoAs(photo.key, await res.blob());
    } catch {
      /* a missing photo retries on the next sync */
    }
  }
  return true;
}

/** Write a parent-check ruling through to the server. */
export async function postResolution(input: {
  kidId: string;
  sheetCode: string;
  questionNumber: number;
  resolution: "correct" | "wrong";
}): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;
  try {
    await fetch("/api/account/resolutions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  } catch {
    /* the ruling is kept locally; the next sync reconciles */
  }
}
