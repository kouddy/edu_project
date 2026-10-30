"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { kidTrackLabel, type Snapshot } from "@/lib/derive";
import { getAuthState, signOut } from "@/lib/store";
import { ScreenHeader } from "./ui";

interface Props {
  snap: Snapshot;
  onSignOut: () => void;
}

/* Styled directly from the wireframe's Profile (.card, .parentlabel,
   .qrcard/.qrbox, .kidrow, .btn.secondary): Sign out uses the same
   12px-radius rectangular secondary button as the other screens —
   not a rounded pill. */
const CARD =
  "mb-3 rounded-[16px] border-[1.5px] border-linesoft bg-card px-[15px] py-[14px] shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";
const H3 = "font-display text-[15.5px] font-extrabold text-ink";
const BTN_SECONDARY =
  "block w-full rounded-[12px] border-[1.5px] border-line bg-card px-[14px] py-[13px] text-center text-[15.5px] font-bold text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";

export default function ProfileScreen({ snap, onSignOut }: Props) {
  const parent = snap.parent;
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [email] = useState<string | undefined>(() => getAuthState().email);
  const [mode] = useState(() => getAuthState().mode);

  useEffect(() => {
    if (!parent) return;
    QRCode.toDataURL(`practice-sheets:member:${parent.id}`, {
      width: 336,
      margin: 0,
      color: { dark: "#3d2b1f", light: "#ffffff" },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(null));
  }, [parent]);

  if (!parent) return null;

  return (
    <div className="px-[18px] pb-[26px] pt-[14px]">
      <ScreenHeader kicker="Practice Sheets" title="Profile" />

      <div className={CARD}>
        <p className="mb-[3px] text-[11.5px] font-bold uppercase tracking-[0.12em] text-faint">
          Parent account
        </p>
        <p className="font-display text-[24px] font-extrabold text-ink">
          {parent.name}
        </p>
        <p className="mt-[3px] text-[13px] text-mid">
          {mode === "guest"
            ? "Guest mode — a fresh account for testing"
            : (email ?? "Signed in with an emailed link")}
        </p>
      </div>

      <div className={`${CARD} px-4 pb-4 pt-5 text-center`}>
        <h3 className="mb-1 font-display text-[16px] font-extrabold text-ink">Your member code</h3>
        <div className="mx-auto my-3 flex h-[196px] w-[196px] items-center justify-center rounded-[14px] border-[1.5px] border-linesoft bg-white p-[14px] shadow-[0_2px_8px_rgba(146,90,32,0.14)]">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="Your member code" className="block h-full w-full" />
          ) : (
            <span className="text-[28px] text-faint">▦</span>
          )}
        </div>
        <p className="mx-auto max-w-[280px] text-[13.5px] leading-[1.5] text-mid">
          Show this code to staff to add a child, or when picking up sheets.
        </p>
      </div>

      <div className={CARD}>
        <h3 className={`${H3} mb-1`}>My kids</h3>
        {snap.kids.map((kid) => (
          <div
            key={kid.id}
            className="flex items-center justify-between gap-2.5 border-b border-dashed border-linesoft px-0.5 py-[11px] last:border-b-0"
          >
            <div>
              <p className="text-[14.5px] font-semibold leading-snug text-ink">{kid.name}</p>
              <p className="text-[12.5px] text-mid">{kidTrackLabel(kid)}</p>
            </div>
            <span className="inline-block rounded-full border-[1.5px] border-linesoft bg-fill px-2.5 py-[3px] text-[12px] font-bold text-mid">
              Enrolled
            </span>
          </div>
        ))}
        <p className="mt-[11px] text-[13.5px] leading-[1.45] text-mid">
          Children are added by staff — just show your member code.
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          signOut();
          onSignOut();
        }}
        className={BTN_SECONDARY}
      >
        Sign out
      </button>
    </div>
  );
}
