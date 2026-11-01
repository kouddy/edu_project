"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/* The member code card, shared by Profile and the join screen a
   new parent lands on before any child is linked. The payload is
   the parent's id plus their sign-in email when known, so staff
   scanning it can match the account by either; it is generated
   on-device and is a bare identifier for linking a child or
   checking a pickup, not a credential. */
const CARD =
  "mb-3 rounded-[16px] border-[1.5px] border-linesoft bg-card px-[15px] py-[14px] shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";

export default function MemberCodeCard({
  parentId,
  email,
}: {
  parentId: string;
  email?: string;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    const payload = email
      ? `practice-sheets:member:${parentId}?email=${encodeURIComponent(email)}`
      : `practice-sheets:member:${parentId}`;
    QRCode.toDataURL(payload, {
      width: 336,
      margin: 0,
      color: { dark: "#3d2b1f", light: "#ffffff" },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(null));
  }, [parentId, email]);

  return (
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
  );
}
