"use client";

import { useEffect, useState } from "react";
import {
  Breadcrumbs,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  Chip,
  Link,
  Skeleton,
  Tab,
  Tabs,
} from "@heroui/react";
import type { ReviewItem } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function LoadingList() {
  return (
    <div className="flex flex-col gap-3" aria-label="Loading reviews">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-2">
          <CardBody className="gap-2 px-5 py-4">
            <Skeleton className="h-5 w-2/5 rounded-md" />
            <Skeleton className="h-4 w-1/4 rounded-md" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

export default function ReviewPage() {
  const [due, setDue] = useState<ReviewItem[] | null>(null);
  const [upcoming, setUpcoming] = useState<ReviewItem[]>([]);
  const [workingId, setWorkingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/review-queue");
    const data = await res.json();
    setDue(data.due ?? []);
    setUpcoming(data.upcoming ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function markDone(id: string) {
    setWorkingId(id);
    try {
      await fetch(`/api/reviews/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      await load();
    } finally {
      setWorkingId((current) => (current === id ? null : current));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem>Review queue</BreadcrumbItem>
      </Breadcrumbs>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Spaced review
        </h1>
        <p className="max-w-2xl text-[16px] leading-relaxed text-default-600">
          Wrong answers come back after 1 day, 1 week, and 1 month — short sessions
          that lock in what was missed.
        </p>
      </div>

      {due === null ? (
        <LoadingList />
      ) : (
        <Tabs aria-label="Review lists" color="primary" variant="underlined">
          <Tab key="due" title={`Due now (${due.length})`}>
            <div className="flex flex-col gap-3 pt-2">
              {due.length === 0 ? (
                <Card className="p-2">
                  <CardBody className="px-5 py-8 text-center">
                    <p className="text-lg font-bold">All caught up</p>
                    <p className="mt-1 text-[15px] text-default-600">
                      Nothing is due right now. New misses will show up here after the
                      next grading.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                due.map((r) => (
                  <Card key={r.id} className="p-2">
                    <CardBody className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[16px]">
                          <span className="font-bold">{r.sheetId}</span>
                          <span className="text-default-600"> · question {r.qid}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip size="sm" color="warning" variant="flat">
                            Due {formatDate(r.dueAt)}
                          </Chip>
                          <Link
                            href={`/attempts/${r.attemptId}`}
                            size="sm"
                            showAnchorIcon
                          >
                            View attempt
                          </Link>
                        </div>
                      </div>
                      <Button
                        color="primary"
                        variant="flat"
                        onPress={() => markDone(r.id)}
                        isLoading={workingId === r.id}
                        isDisabled={workingId !== null}
                        className="sm:w-auto"
                      >
                        Mark done
                      </Button>
                    </CardBody>
                  </Card>
                ))
              )}
            </div>
          </Tab>
          <Tab key="upcoming" title={`Upcoming (${upcoming.length})`}>
            <div className="flex flex-col gap-3 pt-2">
              {upcoming.length === 0 ? (
                <Card className="p-2">
                  <CardBody className="px-5 py-8 text-center">
                    <p className="text-lg font-bold">Nothing scheduled</p>
                    <p className="mt-1 text-[15px] text-default-600">
                      Future reviews will appear here once questions are missed.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                upcoming.map((r) => (
                  <Card key={r.id} className="p-2">
                    <CardBody className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[16px]">
                        <span className="font-bold">{r.sheetId}</span>
                        <span className="text-default-600"> · question {r.qid}</span>
                      </p>
                      <Chip size="sm" variant="flat">
                        Due {formatDate(r.dueAt)}
                      </Chip>
                    </CardBody>
                  </Card>
                ))
              )}
            </div>
          </Tab>
        </Tabs>
      )}
    </div>
  );
}
