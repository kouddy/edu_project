"use client";

import { useRef, useState } from "react";

const BTN =
  "block w-full rounded-[12px] border-[1.5px] border-tangdeep bg-[linear-gradient(165deg,#f07d12,#e8710a)] px-[14px] py-[13px] text-center text-[15.5px] font-bold text-[#fff8ec] shadow-[0_3px_8px_rgba(199,91,0,0.28)]";

interface Props {
  onSignedIn: (email?: string) => void;
  showToast: (msg: string) => void;
}

/**
 * The prototype's sign-in, carried over as-is: an emailed one-tap link, no
 * password. Local-first phase — nothing is actually sent; "Continue (demo)"
 * and "Skip for demo" both enter the app, and the signed-in flag is a
 * device-local record in lib/store.ts.
 */
export default function SignInScreen({ onSignedIn, showToast }: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sendLink = () => {
    const v = email.trim();
    if (!v || !v.includes("@")) {
      showToast("Enter an email address first");
      inputRef.current?.focus();
      return;
    }
    setEmail(v);
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
        <button type="button" className={BTN} onClick={() => onSignedIn(email)}>
          Continue (demo)
        </button>
        <div className="mt-2.5 flex items-center justify-center">
          <Linkish onClick={() => setSent(false)}>Use a different email</Linkish>
          <Linkish onClick={() => showToast("New sign-in link sent (demo)")}>Resend link</Linkish>
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
          if (e.key === "Enter") sendLink();
        }}
        className="mb-3.5 w-full rounded-[11px] border-[1.5px] border-line bg-card px-[13px] py-3 text-[15px] text-ink outline-none placeholder:text-faint focus:border-tang focus:shadow-[0_0_0_3px_#fdebd0]"
      />
      <button type="button" className={BTN} onClick={sendLink}>
        Email me a sign-in link
      </button>
      <p className="mt-3.5 text-center">
        <Linkish onClick={() => onSignedIn()}>Skip for demo</Linkish>
      </p>
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
