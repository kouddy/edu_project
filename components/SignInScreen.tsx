"use client";

import { useRef, useState } from "react";
import { Button } from "@heroui/react";

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
      <div className="px-[18px] pb-6 pt-[30px] text-center">
        <div className="mb-2.5 mt-[26px] text-[44px] leading-none text-tang">✉</div>
        <h2 className="mb-1.5 text-[24px] font-extrabold text-ink">Check your email</h2>
        <p className="mx-auto mb-3.5 max-w-[320px] text-[14px] leading-relaxed text-mid">
          We sent a sign-in link to <strong className="text-ink">{email || "your email"}</strong>.
          <br />
          Tap it on this phone to continue.
        </p>
        <Button size="lg" fullWidth className="font-bold" onPress={() => onSignedIn(email)}>
          Continue (demo)
        </Button>
        <div className="mt-2.5 flex items-center justify-center">
          <Linkish onClick={() => setSent(false)}>Use a different email</Linkish>
          <Linkish onClick={() => showToast("New sign-in link sent (demo)")}>Resend link</Linkish>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[18px] pb-6 pt-[38px]">
      <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-tangdeep">
        Practice Sheets
      </p>
      <h1 className="mb-1.5 text-[26px] font-extrabold leading-tight text-ink">Welcome back</h1>
      <p className="mb-3.5 text-[14px] leading-relaxed text-mid">
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
        className="mb-3.5 w-full rounded-[11px] border-[1.5px] border-line bg-card px-[13px] py-3 text-[15px] text-ink outline-none placeholder:text-faint focus:border-tang"
      />
      <Button size="lg" fullWidth className="font-bold" onPress={sendLink}>
        Email me a sign-in link
      </Button>
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
