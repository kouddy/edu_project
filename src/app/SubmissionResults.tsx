"use client";

import { useEffect, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { store } from "@/lib/browser-store";
import type { GradedResult } from "@/lib/product-types";
import GradeResults from "./GradeResults";

/** Expandable grading results for one submission. Loads lazily from the store. */
export default function SubmissionResults({
  submissionId,
}: {
  submissionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<GradedResult | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let live = true;
    store.getGradedResult(submissionId).then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [open, submissionId]);

  if (!open) {
    return (
      <Button size="sm" variant="light" color="primary" onPress={() => setOpen(true)}>
        View results
      </Button>
    );
  }
  if (result === undefined) {
    return (
      <span className="flex items-center gap-2 py-2 text-sm text-default-500">
        <Spinner size="sm" /> Loading results…
      </span>
    );
  }
  if (result === null) {
    return <p className="text-sm text-default-500">No results saved for this upload.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <GradeResults result={result} />
      <Button size="sm" variant="light" onPress={() => setOpen(false)}>
        Hide results
      </Button>
    </div>
  );
}
