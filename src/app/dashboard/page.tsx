"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Link,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import { newId, store } from "@/lib/browser-store";
import type { Child, Submission, SubmissionStatus } from "@/lib/product-types";
import { gradeSubmission } from "@/lib/grade-client";
import PhotoThumb from "../PhotoThumb";
import SubmissionResults from "../SubmissionResults";

const GRADES = [1, 2, 3, 4, 5, 6];

const STATUS_COLOR: Record<SubmissionStatus, "primary" | "success" | "warning" | "danger"> = {
  uploaded: "primary",
  graded: "success",
  rejected: "warning",
  failed: "danger",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [gradingId, setGradingId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await store.syncSheets();
        const [c, s] = await Promise.all([
          store.listChildren(),
          store.listSubmissions(),
        ]);
        if (live) {
          setChildren(c);
          setSubmissions(s);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Failed to load dashboard.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function onGrade(id: string) {
    if (gradingId) return;
    setGradingId(id);
    try {
      await gradeSubmission(id);
      setSubmissions(await store.listSubmissions());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed.");
    } finally {
      setGradingId(null);
    }
  }

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const gradeNum = Number(grade);
    if (!trimmed || !GRADES.includes(gradeNum) || saving) return;
    setSaving(true);
    setError(null);
    try {
      await store.saveChild({ id: newId("child"), name: trimmed, grade: gradeNum });
      setChildren(await store.listChildren());
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save child.");
    } finally {
      setSaving(false);
    }
  }

  if (children === null) {
    return (
      <Card className="p-2">
        <CardBody className="flex flex-row items-center gap-3 px-5 py-6">
          <Spinner size="sm" />
          <p className="text-[15px] text-default-600">Loading dashboard…</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Parent dashboard
        </h1>
        <p className="max-w-2xl text-[16px] leading-relaxed text-default-600">
          Your children and their worksheet uploads. Everything is stored on this
          device for now.
        </p>
      </div>

      {error ? (
        <Alert color="danger" title="Something went wrong" description={error} />
      ) : null}

      <Card className="p-2">
        <CardHeader className="flex-col items-start gap-1 px-5 pb-1 pt-4">
          <h2 className="text-xl font-extrabold tracking-tight">Children</h2>
          <p className="text-[15px] text-default-600">
            {children.length === 0
              ? "No children yet — add one below to get started."
              : `${children.length} child${children.length === 1 ? "" : "ren"} in your family.`}
          </p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4 px-5 pb-5">
          {children.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {children.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <Avatar name={c.name} size="sm" />
                  <span className="text-[15px] font-semibold">{c.name}</span>
                  <Chip size="sm" variant="flat">
                    Grade {c.grade}
                  </Chip>
                  <span className="flex-1" />
                  <Button
                    as={Link}
                    href={`/upload?childId=${encodeURIComponent(c.id)}`}
                    size="sm"
                    variant="flat"
                    color="primary"
                  >
                    Upload sheet
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <Divider />

          <form
            onSubmit={addChild}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <Input
              label="Name"
              placeholder="e.g. Maya"
              value={name}
              onValueChange={setName}
              className="sm:max-w-xs"
            />
            <Select
              label="Grade"
              selectedKeys={[grade]}
              onSelectionChange={(keys) => {
                const next = keys === "all" ? undefined : Array.from(keys)[0];
                if (next !== undefined) setGrade(String(next));
              }}
              className="sm:max-w-[120px]"
            >
              {GRADES.map((g) => (
                <SelectItem key={String(g)}>{String(g)}</SelectItem>
              ))}
            </Select>
            <Button
              type="submit"
              color="primary"
              isLoading={saving}
              isDisabled={!name.trim() || saving}
            >
              Add child
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card className="p-2">
        <CardHeader className="flex-col items-start gap-1 px-5 pb-1 pt-4">
          <h2 className="text-xl font-extrabold tracking-tight">Recent uploads</h2>
          <p className="text-[15px] text-default-600">
            Photos load back from storage on this device.
          </p>
        </CardHeader>
        <CardBody className="px-5 pb-5">
          {submissions.length === 0 ? (
            <p className="text-[15px] text-default-600">
              No uploads yet.{" "}
              <Link href="/upload" color="primary">
                Upload a finished worksheet
              </Link>
              .
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {submissions.slice(0, 8).map((s) => {
                const child = children.find((c) => c.id === s.childId);
                return (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 rounded-xl border border-divider p-3"
                  >
                    <PhotoThumb
                      photoId={s.photoId}
                      alt={`Uploaded worksheet for ${child?.name ?? "child"}`}
                      className="max-h-48 w-full rounded-lg border border-divider object-contain bg-default-100"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[15px] font-semibold">
                        {child?.name ?? "Unknown child"} · {s.sheetCode}
                      </span>
                      <Chip size="sm" variant="flat" color={STATUS_COLOR[s.status]}>
                        {s.status}
                      </Chip>
                    </div>
                    <span className="text-sm text-default-500">
                      {formatDate(s.createdAt)}
                    </span>
                    {s.message ? (
                      <p className="text-sm leading-relaxed text-default-600">{s.message}</p>
                    ) : null}
                    {(s.status === "uploaded" || s.status === "failed") && (
                      <div>
                        <Button
                          size="sm"
                          variant="flat"
                          color="primary"
                          isLoading={gradingId === s.id}
                          isDisabled={gradingId !== null}
                          onPress={() => onGrade(s.id)}
                        >
                          {gradingId === s.id
                            ? "Grading…"
                            : s.status === "failed"
                              ? "Try grading again"
                              : "Grade now"}
                        </Button>
                      </div>
                    )}
                    {s.status === "graded" && <SubmissionResults submissionId={s.id} />}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
