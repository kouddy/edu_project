"use client";

import { useEffect, useState } from "react";
import { Avatar, Button, Card } from "@heroui/react";
import QRCode from "qrcode";
import { kidTrackLabel, type Snapshot } from "@/lib/derive";
import { ScreenHeader } from "./ui";

interface Props {
  snap: Snapshot;
  showToast: (msg: string) => void;
}

export default function ProfileScreen({ snap, showToast }: Props) {
  const parent = snap.parent;
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!parent) return;
    QRCode.toDataURL(`practice-sheets:member:${parent.id}`, {
      width: 240,
      margin: 1,
      color: { dark: "#3d2b1f", light: "#fffdf7" },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(null));
  }, [parent]);

  if (!parent) return null;
  const initials = parent.name
    .replace(".", "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="px-[18px] pb-6 pt-4">
      <ScreenHeader kicker="Practice Sheets" title="Profile" />

      <Card className="mb-4 shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
        <Card.Content className="flex-row items-center gap-3.5 p-4">
          <Avatar size="lg" color="accent">
            <Avatar.Fallback className="font-extrabold">{initials}</Avatar.Fallback>
          </Avatar>
          <div>
            <p className="text-[18px] font-extrabold text-ink">{parent.name}</p>
            <p className="text-[13px] text-mid">Parent account</p>
          </div>
        </Card.Content>
      </Card>

      <Card className="mb-4 shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
        <Card.Content className="items-center p-5 text-center">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="Your member code" className="h-[200px] w-[200px]" />
          ) : (
            <div className="flex h-[200px] w-[200px] items-center justify-center rounded-xl border-2 border-dashed border-line text-faint">
              ▦
            </div>
          )}
          <p className="mt-3 max-w-[270px] text-[13.5px] leading-snug text-mid">
            Show this code to staff to add a child, or when picking up sheets.
          </p>
        </Card.Content>
      </Card>

      <h2 className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.12em] text-faint">
        My kids
      </h2>
      <Card className="mb-5 shadow-[0_2px_7px_rgba(146,90,32,0.12)]">
        <Card.Content className="p-0">
          {snap.kids.map((kid, i) => (
            <div
              key={kid.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-dashed border-linesoft" : ""}`}
            >
              <Avatar size="md" color="accent">
                <Avatar.Fallback className="font-bold">{kid.name[0]}</Avatar.Fallback>
              </Avatar>
              <div>
                <p className="text-[15.5px] font-bold text-ink">{kid.name}</p>
                <p className="text-[12.5px] text-faint">{kidTrackLabel(kid)}</p>
              </div>
            </div>
          ))}
          <p className="border-t border-dashed border-linesoft px-4 py-3 text-[12.5px] leading-snug text-faint">
            Children are added by staff. If anything looks off, talk to us when you pick up
            sheets.
          </p>
        </Card.Content>
      </Card>

      <Button
        variant="ghost"
        fullWidth
        onPress={() => showToast("You're signed in on this device")}
        className="font-bold text-rose"
      >
        Sign out
      </Button>
    </div>
  );
}
