"use client";

import { useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase-client";

const BTN =
  "block w-full rounded-[12px] border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[14px] py-[13px] text-center text-[15.5px] font-bold text-[#fff8ec] shadow-[0_3px_8px_rgba(199,91,0,0.28)]";
const BTN_SECONDARY =
  "block w-full rounded-[12px] border-[1.5px] border-line bg-card px-[14px] py-[13px] text-center text-[15.5px] font-bold text-tangdeep shadow-[0_2px_7px_rgba(146,90,32,0.12),0_1px_2px_rgba(146,90,32,0.10)]";

interface Props {
  /** Enter demo mode: the seeded test account (Amy and Bob). */
  onDemo: () => void;
  showToast: (msg: string) => void;
}

/**
 * Sign-in: an emailed one-tap link, no password. The link is real —
 * tapping it returns to the app with a session, and AppShell enters
 * the live account. When no Supabase project is configured there is
 * no account to sign in to, so the screen offers the demo account
 * only.
 */
export default function SignInScreen({ onDemo, showToast }: Props) {
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
    if (!supabase) return;
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

  const demoBlock = (
    <div className={live ? "mt-5 border-t border-dashed border-linesoft pt-5" : ""}>
      <button type="button" className={BTN_SECONDARY} onClick={onDemo}>
        Demo
      </button>
      <p className="mt-2.5 text-center text-[12px] leading-[1.5] text-faint">
        For testing: Amy (Grade 3) and Bob (Grade 4), with their packets and
        two weeks of marked history.
      </p>
    </div>
  );

  if (!live) {
    return (
      <div className="px-[18px] pb-[26px] pt-[52px]">
        <p className="mb-1.5 mt-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-tangdeep">
          Practice Sheets
        </p>
        <h1 className="mb-1.5 font-display text-[23px] font-extrabold leading-[1.15] text-ink">
          Welcome
        </h1>
        <p className="mb-5 text-[13.5px] leading-[1.45] text-mid">
          Account sign-in isn’t set up on this build yet. You can explore the
          whole app with the demo account.
        </p>
        {demoBlock}
      </div>
    );
  }

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
        <p className="mx-auto mb-3.5 max-w-[320px] text-[13.5px] leading-[1.45] text-mid">
          This page will sign you in once you tap the link.
        </p>
        <div className="mt-2.5 flex items-center justify-center">
          <Linkish onClick={() => setSent(false)}>Use a different email</Linkish>
          <Linkish onClick={() => void sendLink()}>Resend link</Linkish>
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
      <p className="mt-2.5 text-center text-[12px] text-faint">
        No password — we email you a one-tap link.
      </p>
      {demoBlock}
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
