"use client";

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Link,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import { newId, store } from "@/lib/browser-store";
import type { Child, Sheet, Submission } from "@/lib/product-types";
import PhotoThumb from "../PhotoThumb";

const MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [children, setChildren] = useState<Child[] | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [childId, setChildId] = useState("");
  const [sheetCode, setSheetCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Submission | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await store.seedIfEmpty();
        const [c, s] = await Promise.all([
          store.listChildren(),
          store.listSheets(),
        ]);
        if (!live) return;
        setChildren(c);
        setSheets(s);
        const wanted = new URLSearchParams(window.location.search).get("childId");
        if (wanted && c.some((k) => k.id === wanted)) setChildId(wanted);
        else if (c.length === 1) setChildId(c[0].id);
        if (s.length === 1) setSheetCode(s[0].sheetCode);
      } catch (e) {
        if (live)
          setError(e instanceof Error ? e.message : "Failed to load upload form.");
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }
    if (!next.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG, WebP, …).");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError(
        `That photo is ${formatBytes(next.size)} — the limit is 10 MB. Please use a smaller file.`
      );
      return;
    }
    setError(null);
    setFile(next);
  }

  const trimmedCode = sheetCode.trim();
  const knownCode =
    trimmedCode !== "" &&
    sheets.some((s) => s.sheetCode.toLowerCase() === trimmedCode.toLowerCase());
  const canSubmit =
    !busy && file !== null && childId !== "" && trimmedCode !== "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setBusy(true);
    setError(null);
    try {
      const photoId = newId("photo");
      await store.savePhoto(photoId, file);
      const submission: Submission = {
        id: newId("sub"),
        childId,
        sheetCode: trimmedCode,
        photoId,
        status: "uploaded",
        createdAt: new Date().toISOString(),
      };
      await store.saveSubmission(submission);
      setDone(submission);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDone(null);
    setSheetCode(sheets.length === 1 ? sheets[0].sheetCode : "");
    setError(null);
  }

  if (children === null) {
    return (
      <Card className="p-2">
        <CardBody className="flex flex-row items-center gap-3 px-5 py-6">
          <Spinner size="sm" />
          <p className="text-[15px] text-default-600">Loading upload form…</p>
        </CardBody>
      </Card>
    );
  }

  // -- confirmation ---------------------------------------------------------
  if (done) {
    const child = children.find((c) => c.id === done.childId);
    return (
      <div className="flex flex-col gap-6">
        <Alert
          color="success"
          title="Upload saved"
          description={`Thanks! ${child?.name ?? "Your child"}'s worksheet (${done.sheetCode}) was saved and is ready for grading.`}
        />
        <Card className="p-2">
          <CardHeader className="flex-col items-start gap-1 px-5 pb-1 pt-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold tracking-tight">Confirmation</h2>
              <Chip size="sm" variant="flat" color="primary">
                {done.status}
              </Chip>
            </div>
            <p className="text-[15px] text-default-600">
              Submission {done.id} · {child?.name} · {done.sheetCode}
            </p>
          </CardHeader>
          <CardBody className="flex flex-col gap-3 px-5 pb-5">
            <PhotoThumb
              photoId={done.photoId}
              alt="Uploaded worksheet photo, loaded back from storage"
              className="max-h-72 w-full rounded-lg border border-divider object-contain bg-default-100"
            />
            <p className="text-sm text-default-500">
              This photo was loaded back from storage on this device.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button color="primary" onPress={reset}>
                Upload another
              </Button>
              <Button as={Link} href="/dashboard" variant="flat">
                Back to dashboard
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // -- form -----------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Upload a worksheet
        </h1>
        <p className="max-w-2xl text-[16px] leading-relaxed text-default-600">
          Pick your child and the sheet code, then add a photo of the finished
          worksheet.
        </p>
      </div>

      {error ? (
        <Alert color="danger" title="Something went wrong" description={error} />
      ) : null}

      <Card className="p-2">
        <CardBody className="px-5 pb-5 pt-5">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Select
              label="Child"
              placeholder={
                children.length === 0 ? "Add a child first" : "Choose your child"
              }
              selectedKeys={childId ? [childId] : []}
              onSelectionChange={(keys) => {
                const next = keys === "all" ? undefined : Array.from(keys)[0];
                if (typeof next === "string") setChildId(next);
              }}
              isDisabled={children.length === 0}
            >
              {children.map((c) => (
                <SelectItem key={c.id} textValue={c.name}>
                  {c.name} (Grade {c.grade})
                </SelectItem>
              ))}
            </Select>
            {children.length === 0 ? (
              <p className="-mt-2 text-[15px] text-default-600">
                No children yet —{" "}
                <Link href="/dashboard" color="primary">
                  add one on the dashboard
                </Link>{" "}
                first.
              </p>
            ) : null}

            <div>
              <Input
                label="Sheet code"
                placeholder="e.g. G3-MATH-TEST-A"
                value={sheetCode}
                onValueChange={setSheetCode}
                list="sheet-codes"
                description={
                  sheets.length > 0
                    ? "Type a code or pick one you already have."
                    : undefined
                }
              />
              <datalist id="sheet-codes">
                {sheets.map((s) => (
                  <option key={s.sheetCode} value={s.sheetCode}>
                    Grade {s.grade} {s.subject} · {s.week}
                  </option>
                ))}
              </datalist>
              {trimmedCode !== "" && !knownCode ? (
                <p className="mt-1.5 text-sm text-warning-600">
                  “{trimmedCode}” isn’t in your sheet library yet — you can still
                  upload it.
                </p>
              ) : null}
            </div>

            <div>
              <div
                role="button"
                tabIndex={0}
                aria-label="Worksheet photo drop zone"
                onClick={() => pickerRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") pickerRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  dragging
                    ? "border-primary bg-primary-50"
                    : "border-default-300 bg-default-100/60 hover:border-default-400"
                }`}
              >
                {preview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Selected worksheet photo preview"
                      className="max-h-44 rounded-lg border border-divider object-contain"
                    />
                    <span className="text-sm font-semibold">
                      {file?.name}{" "}
                      <span className="font-normal text-default-600">
                        ({file ? formatBytes(file.size) : ""})
                      </span>
                    </span>
                    <span className="text-sm text-primary">
                      Choose a different photo
                    </span>
                  </>
                ) : (
                  <>
                    <svg
                      width="30"
                      height="30"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      className="text-default-400"
                    >
                      <rect x="3" y="6" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="2" />
                      <circle cx="9" cy="11" r="1.6" fill="currentColor" />
                      <path
                        d="M3.5 17.5l5-5 3.5 3.5 3-3 5.5 5.5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="text-[15px] font-semibold">
                      Drop a photo here, or choose below
                    </span>
                    <span className="text-sm text-default-600">
                      Image files only · max 10 MB
                    </span>
                  </>
                )}
              </div>
              <input
                ref={pickerRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Choose worksheet photo from files"
                onChange={(e) => {
                  pickFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                aria-label="Take a worksheet photo with the camera"
                onChange={(e) => {
                  pickFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="flat"
                  onPress={() => pickerRef.current?.click()}
                >
                  Choose photo
                </Button>
                <Button
                  variant="flat"
                  onPress={() => cameraRef.current?.click()}
                >
                  Take photo
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              color="primary"
              size="lg"
              isLoading={busy}
              isDisabled={!canSubmit}
            >
              {busy ? "Saving…" : "Submit upload"}
            </Button>
            <p className="text-sm text-default-600">
              For best results: flatten the sheet, include all four corners, and
              use good light.
            </p>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
