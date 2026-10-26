"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Select,
  SelectItem,
} from "@heroui/react";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadForm({
  sheets,
}: {
  sheets: { id: string; title: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheetId, setSheetId] = useState(sheets[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Please choose a JPG, PNG, or WebP photo.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("That photo is over 10 MB. Please use a smaller file.");
      return;
    }
    setError(null);
    setFile(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !sheetId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("sheetId", sheetId);
      form.append("photo", file);
      const res = await fetch("/api/attempts", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      router.push(`/attempts/${data.attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-2">
      <CardHeader className="flex-col items-start gap-1 px-5 pb-1 pt-4">
        <h2 className="text-xl font-extrabold tracking-tight">Grade a finished sheet</h2>
        <p className="text-[15px] text-default-600">
          Pick the worksheet, add a photo of the answers, and get per-question results.
        </p>
      </CardHeader>
      <CardBody className="px-5 pb-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Select
            label="Worksheet"
            placeholder="Choose a sheet"
            selectedKeys={sheetId ? [sheetId] : []}
            onSelectionChange={(keys) => {
              const next = keys === "all" ? undefined : Array.from(keys)[0];
              if (typeof next === "string") setSheetId(next);
            }}
            isDisabled={sheets.length === 0}
          >
            {sheets.map((s) => (
              <SelectItem key={s.id} textValue={s.title}>
                {s.title}
              </SelectItem>
            ))}
          </Select>

          <div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
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
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                dragging
                  ? "border-primary bg-primary-50"
                  : "border-default-300 bg-default-100/60 hover:border-default-400"
              }`}
            >
              {preview ? (
                <>
                  <img
                    src={preview}
                    alt="Selected worksheet photo"
                    className="max-h-44 rounded-lg border border-divider object-contain"
                  />
                  <span className="text-sm font-semibold">
                    {file?.name}{" "}
                    <span className="font-normal text-default-600">
                      ({file ? formatBytes(file.size) : ""})
                    </span>
                  </span>
                  <span className="text-sm text-primary">Choose a different photo</span>
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
                    Drop a photo here, or <span className="text-primary">browse files</span>
                  </span>
                  <span className="text-sm text-default-600">JPG, PNG, or WebP · max 10 MB</span>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              aria-label="Worksheet photo"
              onChange={(e) => {
                pickFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          {error ? (
            <Alert color="danger" title="Something went wrong" description={error} />
          ) : null}

          <div className="flex flex-col gap-3">
            <Button
              type="submit"
              color="primary"
              size="lg"
              isLoading={busy}
              isDisabled={!file || !sheetId || busy || sheets.length === 0}
            >
              {busy ? "Grading…" : "Upload and grade"}
            </Button>
            <p className="text-sm text-default-600">
              For best results: flatten the sheet, include all four corners, and use good
              light. Anything unclear is marked <em>unsure</em> for you to check — never
              guessed.
            </p>
          </div>
        </form>
      </CardBody>
      <Divider className="mx-5 w-auto" />
      <p className="px-5 pb-4 pt-2 text-xs text-default-500">
        Grading one photo costs a few cents of AI usage.
      </p>
    </Card>
  );
}
