"use client";

import { useState } from "react";
import MemberCodeCard from "./MemberCode";

/* The first screen a live parent sees before any child is linked.
   The app has nothing to show them yet, so the screen carries the
   one action that moves them forward — showing their member code
   to staff — plus their name and email under the code so staff can
   confirm the account out loud. Check again re-pulls the account;
   the moment a child is linked, AppShell stops rendering this
   screen on its own. */
const BTN_SECONDARY =
  "block w-full rounded-[12px] border-[1.5px] border-line bg-card px-[14px] py-[13px] text-center text-[15.5px] font-bold text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";

interface Props {
  parentId: string;
  parentName: string;
  email?: string;
  onCheckAgain: () => Promise<void>;
  onSignOut: () => void;
}

export default function JoinScreen({ parentId, parentName, email, onCheckAgain, onSignOut }: Props) {
  const [checking, setChecking] = useState(false);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-paper px-[18px] pb-[26px] pt-[52px]">
      <h1 className="mb-1.5 font-display text-[23px] font-extrabold leading-[1.15] text-ink">
        You&rsquo;re signed in
      </h1>
      <p className="mb-3.5 text-[13.5px] leading-[1.45] text-mid">
        No children are on your account yet. Our team adds them when you pick
        up your first packet — once that&rsquo;s done, they&rsquo;ll appear
        here.
      </p>

      <MemberCodeCard parentId={parentId} email={email} />

      <p className="mb-4 text-center text-[13px] text-mid">
        {parentName}
        {email ? ` · ${email}` : ""}
      </p>

      <button
        type="button"
        disabled={checking}
        onClick={() => {
          setChecking(true);
          void onCheckAgain().finally(() => setChecking(false));
        }}
        className={BTN_SECONDARY}
      >
        {checking ? "Checking…" : "Check again"}
      </button>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-3 py-2 text-center text-[14px] font-semibold text-mid"
      >
        Sign out
      </button>
    </div>
  );
}
