"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Spinner } from "@heroui/react";
import { deletePhoto, getAuthState, resolveCheck, savePhoto, signIn } from "@/lib/store";
import { gradeStagedPhotos } from "@/lib/grading";
import { loadSnapshot, pendingChecks, type CheckItem, type Snapshot } from "@/lib/derive";
import type { Kid } from "@/lib/store";
import HomeScreen from "./HomeScreen";
import ScanScreen, { type StagedPhoto } from "./ScanScreen";
import ResultsScreen, { NotStartedScreen } from "./ResultsScreen";
import CheckScreen from "./CheckScreen";
import ProfileScreen from "./ProfileScreen";
import SignInScreen from "./SignInScreen";
import { IconHome, IconScan, IconUser } from "./ui";

type Screen =
  | { name: "home" }
  | { name: "signin" }
  | { name: "scan" }
  | { name: "marking" }
  | { name: "results"; sheetId: string; origin: "homework" | "history" }
  | { name: "check"; from: "home" } 
  | { name: "check"; from: "results"; sheetId: string; origin: "homework" | "history" }
  | { name: "profile" };

export default function AppShell() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [kidId, setKidId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [scrollSection, setScrollSection] = useState<"homework" | "history" | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(() => {
    const next = loadSnapshot();
    setSnap(next);
    return next;
  }, []);

  useEffect(() => {
    const next = refresh();
    setKidId((prev) => prev ?? next.kids[0]?.id ?? null);
    if (!getAuthState().signedIn) setScreen({ name: "signin" });
  }, [refresh]);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  /* ------------------------------------------------------------ navigation */

  const goHome = useCallback((section?: "homework" | "history") => {
    setScreen({ name: "home" });
    if (section) setScrollSection(section);
  }, []);

  const handleSignedIn = useCallback((email?: string) => {
    signIn(email);
    setScreen({ name: "home" });
  }, []);

  useEffect(() => {
    if (screen.name !== "home" || !scrollSection) return;
    const t = setTimeout(() => {
      document
        .getElementById(`section-${scrollSection}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
      setScrollSection(null);
    }, 60);
    return () => clearTimeout(t);
  }, [screen, scrollSection]);

  const openSheet = useCallback((sheetId: string, origin: "homework" | "history") => {
    setScreen({ name: "results", sheetId, origin });
  }, []);

  /* ------------------------------------------------------------ staged photos */

  const addBlobs = useCallback(async (blobs: Blob[]) => {
    const added: StagedPhoto[] = [];
    for (const blob of blobs) {
      try {
        const key = await savePhoto(blob);
        added.push({ key, url: URL.createObjectURL(blob) });
      } catch {
        /* skip photos that fail to save */
      }
    }
    if (added.length > 0) setStaged((prev) => [...prev, ...added]);
  }, []);

  const removeStagedAt = useCallback((index: number) => {
    setStaged((prev) => {
      const target = prev[index];
      if (target) {
        URL.revokeObjectURL(target.url);
        deletePhoto(target.key).catch(() => {});
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  /* ------------------------------------------------------------ grading flow */

  const handleGrade = useCallback(async () => {
    const keys = staged.map((p) => p.key);
    if (keys.length === 0) return;
    setScreen({ name: "marking" });
    const started = Date.now();
    const outcome = await gradeStagedPhotos(keys);
    const wait = Math.max(0, 1400 - (Date.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    staged.forEach((p) => URL.revokeObjectURL(p.url));
    setStaged([]);
    refresh();
    setScreen({ name: "home" });
    showToast(
      outcome.markedSheets === 1 ? "1 sheet marked" : `${outcome.markedSheets} sheets marked`,
    );
  }, [staged, refresh, showToast]);

  /* ------------------------------------------------------------ checks */

  const handleResolve = useCallback(
    (item: CheckItem, resolution: "correct" | "wrong") => {
      resolveCheck({
        gradeResultId: item.gradeResultId,
        questionNumber: item.questionNumber,
        resolution,
      });
      refresh();
      if (item.questionNumber === 9 && resolution === "wrong") {
        showToast("Q9 marked wrong — recorded in Gina's progress");
      } else {
        showToast(resolution === "correct" ? "Marked correct" : "Marked wrong");
      }
    },
    [refresh, showToast],
  );

  if (!snap || !snap.parent) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <Spinner size="lg" color="accent" />
      </div>
    );
  }

  const kid: Kid = snap.kids.find((k) => k.id === kidId) ?? snap.kids[0];
  const tabVisible =
    screen.name !== "scan" && screen.name !== "marking" && screen.name !== "signin";
  const activeTab =
    screen.name === "profile" ? "profile" : screen.name === "scan" ? "scan" : "home";

  return (
    <div className="flex min-h-dvh justify-center bg-paper">
      <div className="relative flex h-dvh w-full max-w-[430px] flex-col bg-cream shadow-[0_0_50px_rgba(122,74,20,0.25)]">
        {/* ------------------------------------------------------ screens */}
        <div ref={scrollRef} className="screen-scroll min-h-0 flex-1 overflow-y-auto">
          {screen.name === "signin" && (
            <SignInScreen onSignedIn={handleSignedIn} showToast={showToast} />
          )}

          {screen.name === "home" && kid && (
            <HomeScreen
              snap={snap}
              kid={kid}
              onSelectKid={(k) => setKidId(k.id)}
              onOpenSheet={openSheet}
              onOpenCheck={() => setScreen({ name: "check", from: "home" })}
              showToast={showToast}
              scrollSection={scrollSection}
            />
          )}

          {screen.name === "results" &&
            (() => {
              const st = snap.states.get(screen.sheetId);
              if (!st) return null;
              if (!st.result) {
                return (
                  <NotStartedScreen
                    st={st}
                    onBack={() => goHome(screen.origin)}
                    onScan={() => setScreen({ name: "scan" })}
                    showToast={showToast}
                  />
                );
              }
              return (
                <ResultsScreen
                  st={st}
                  onBack={() => goHome(screen.origin)}
                  onOpenCheck={() =>
                    setScreen({
                      name: "check",
                      from: "results",
                      sheetId: screen.sheetId,
                      origin: screen.origin,
                    })
                  }
                  onRemoved={() => {
                    refresh();
                    goHome(screen.origin);
                  }}
                  showToast={showToast}
                />
              );
            })()}

          {screen.name === "check" && (
            <CheckScreen
              items={pendingChecks(snap)}
              onBack={() =>
                screen.from === "results"
                  ? setScreen({
                      name: "results",
                      sheetId: screen.sheetId,
                      origin: screen.origin,
                    })
                  : goHome()
              }
              onResolve={handleResolve}
            />
          )}

          {screen.name === "profile" && (
            <ProfileScreen snap={snap} onSignOut={() => setScreen({ name: "signin" })} />
          )}

          {screen.name === "marking" && (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
              <Spinner size="lg" color="accent" />
              <p className="text-[19px] font-extrabold text-ink">Marking your sheets…</p>
              <p className="text-[14px] text-mid">This takes just a moment.</p>
            </div>
          )}
        </div>

        {screen.name === "scan" && (
          <div className="absolute inset-0 z-20">
            <ScanScreen
              staged={staged}
              onAddBlobs={addBlobs}
              onRemoveAt={removeStagedAt}
              onGrade={handleGrade}
              onExit={() => goHome()}
            />
          </div>
        )}

        {/* ------------------------------------------------------ toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={`pointer-events-none absolute inset-x-0 z-40 flex justify-center px-6 ${
                tabVisible ? "bottom-24" : "bottom-8"
              }`}
            >
              <p className="max-w-full truncate rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-bold text-cream shadow-lg">
                {toast.msg}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ------------------------------------------------------ tab bar */}
        {tabVisible && (
          <nav className="relative z-10 flex flex-none items-end border-t border-linesoft bg-cream px-6 pb-4 pt-2">
            <TabButton
              label="Home"
              active={activeTab === "home"}
              onClick={() => goHome()}
              icon={<IconHome size={24} />}
            />
            <div className="flex flex-1 justify-center">
              <button
                type="button"
                onClick={() => setScreen({ name: "scan" })}
                aria-label="Scan a sheet"
                className="-mt-9 flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full bg-tang text-white shadow-[0_8px_20px_rgba(199,91,0,0.45)] ring-4 ring-cream"
              >
                <IconScan size={26} />
                <span className="text-[9.5px] font-extrabold leading-none">Scan</span>
              </button>
            </div>
            <TabButton
              label="Profile"
              active={activeTab === "profile"}
              onClick={() => setScreen({ name: "profile" })}
              icon={<IconUser size={24} />}
            />
          </nav>
        )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-16 flex-col items-center gap-0.5 py-1 ${
        active ? "text-tang" : "text-faint"
      }`}
    >
      {icon}
      <span className="text-[11px] font-bold">{label}</span>
    </button>
  );
}
