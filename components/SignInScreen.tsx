"use client";

import { useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase-client";

const BTN =
  "block w-full rounded-[12px] border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[14px] py-[13px] text-center text-[15.5px] font-bold text-[#fff8ec] shadow-[0_3px_8px_rgba(199,91,0,0.28)]";
const BTN_SECONDARY =
  "block w-full rounded-[12px] border-[1.5px] border-line bg-card px-[14px] py-[13px] text-center text-[15.5px] font-bold text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";

interface Props {
  onSignedIn: (email?: string) => void;
  /** Enter guest mode: a fresh testing account, separate from the demo. */
  onGuest: () => void;
  showToast: (msg: string) => void;
}

/**
 * The prototype's sign-in: an emailed one-tap link, no password. When a
 * Supabase project is configured (the NEXT_PUBLIC_ vars), the link is
 * real — tapping it returns to the app with a session, and AppShell
 * enters the live account. Without one, nothing is sent: "Continue
 * (demo)" and "Skip for demo" enter the device-local demo, recorded in
 * lib/store.ts.
 */
export default function SignInScreen({ onSignedIn, onGuest, showToast }: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const live = getSupabase() !== null;

  const sendLink = async () => {
    const v = email.trim();
    if (!v || !v.includes("@")) {
      showToast("Enter an email address first");
      inputRef.current?.focus();
      return;
    }
    setEmail(v);
    const supabase = getSupabase();
    if (!supabase) {
      setSent(true);
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: v,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      showToast("We couldn't send the link just now — please try again in a moment.");
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="px-[18px] pb-[26px] pt-[44px] text-center">
        <div className="mb-2.5 mt-[26px] text-[44px] leading-none text-tang">✉</div>
        <h2 className="mb-1.5 font-display text-[19px] font-extrabold text-ink">Check your email</h2>
        <p className="mx-auto mb-3.5 max-w-[320px] text-[13.5px] leading-[1.45] text-mid">
          We sent a sign-in link to <strong className="text-ink">{email || "your email"}</strong>.
          <br />
          Tap it on this phone to continue.
        </p>
        {live ? (
          <p className="mx-auto mb-3.5 max-w-[320px] text-[13.5px] leading-[1.45] text-mid">
            This page will sign you in once you tap the link.
          </p>
        ) : (
          <button type="button" className={BTN} onClick={() => onSignedIn(email)}>
            Continue (demo)
          </button>
        )}
        <div className="mt-2.5 flex items-center justify-center">
          <Linkish onClick={() => setSent(false)}>Use a different email</Linkish>
          <Linkish
            onClick={() => {
              if (live) {
                void sendLink();
              } else {
                showToast("New sign-in link sent (demo)");
              }
            }}
          >
            Resend link
          </Linkish>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[18px] pb-[26px] pt-[52px]">
      <p className="mb-1.5 mt-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-tangdeep">
        Practice Sheets
      </p>
      <h1 className="mb-1.5 font-display text-[23px] font-extrabold leading-[1.15] text-ink">
        Welcome back
      </h1>
      <p className="mb-3.5 text-[13.5px] leading-[1.45] text-mid">
        Sign in to scan sheets, see the results, and check any answers we couldn’t read.
      </p>
      <label htmlFor="signin-email" className="mb-1.5 block text-[13px] font-semibold text-ink">
        Email address
      </label>
      <input
        ref={inputRef}
        id="signin-email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void sendLink();
        }}
        className="mb-3.5 w-full rounded-[11px] border-[1.5px] border-line bg-card px-[13px] py-3 text-[15px] text-ink outline-none placeholder:text-faint focus:border-tang focus:shadow-[0_0_0_3px_#fdebd0]"
      />
      <button type="button" className={BTN} onClick={() => void sendLink()} disabled={sending}>
        {sending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="mt-3.5 text-center">
        <Linkish onClick={() => onSignedIn()}>Skip for demo</Linkish>
      </p>
      <div className="mt-5 border-t border-dashed border-linesoft pt-5">
        <button type="button" className={BTN_SECONDARY} onClick={onGuest}>
          Guest
        </button>
        <p className="mt-2.5 text-center text-[12px] leading-[1.5] text-faint">
          For testing: a fresh account with Amy (Grade 3) and Bob (Grade 4) —
          nothing scanned yet.
        </p>
      </div>
      <p className="mt-[26px] text-center text-[12px] text-faint">
        No password — we email you a one-tap link.
      </p>
    </div>
  );
}

function Linkish({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-1 py-1.5 text-[13px] font-semibold text-tangdeep underline underline-offset-[3px]"
    >
      {children}
    </button>
  );
}
