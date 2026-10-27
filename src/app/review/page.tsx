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
import { store } from "@/lib/browser-store";
import type { Child, ReviewItem } from "@/lib/product-types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Days until the next round after finishing a stage; null = cycle complete. */
const NEXT_DUE_DAYS: Record<number, number | null> = { 0: 7, 1: 30, 2: null };

const STAGE_LABEL: Record<number, string> = {
  0: "Round 1 of 3",
  1: "Round 2 of 3",
  2: "Final round",
};

function reviewKey(r: ReviewItem) {
  return `${r.childId}::${r.topic}::${r.sourceSheetCode}`;
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
  const [children, setChildren] = useState<Child[] | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[] | null>(null);
  const [workingKey, setWorkingKey] = useState<string | null>(null);

  async function load() {
    const [c, r] = await Promise.all([
      store.listChildren(),
      store.listReviewItems(),
    ]);
    setChildren(c);
    setReviews(r);
  }

  useEffect(() => {
    load();
  }, []);

  async function markDone(item: ReviewItem) {
    const key = reviewKey(item);
    setWorkingKey(key);
    try {
      const nextDays = NEXT_DUE_DAYS[item.intervalStage] ?? null;
      if (nextDays === null) {
        await store.deleteReviewItem(
          item.childId,
          item.topic,
          item.sourceSheetCode
        );
      } else {
        await store.upsertReviewItem({
          ...item,
          dueAt: new Date(Date.now() + nextDays * 24 * 3600 * 1000).toISOString(),
          intervalStage: item.intervalStage + 1,
        });
      }
      await load();
    } finally {
      setWorkingKey((current) => (current === key ? null : current));
    }
  }

  const now = new Date().toISOString();
  const due = (reviews ?? []).filter((r) => r.dueAt <= now);
  const upcoming = (reviews ?? []).filter((r) => r.dueAt > now);
  const childName = (id: string) =>
    children?.find((c) => c.id === id)?.name ?? "Your child";

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
          Missed topics come back after 1 day, 1 week, and 1 month — short
          sessions that lock in what was missed.
        </p>
      </div>

      {reviews === null || children === null ? (
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
                due.map((r) => {
                  const key = reviewKey(r);
                  return (
                    <Card key={key} className="p-2">
                      <CardBody className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[16px]">
                            <span className="font-bold capitalize">{r.topic}</span>
                            <span className="text-default-600">
                              {" "}
                              · {childName(r.childId)} · {r.sourceSheetCode}
                            </span>
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip size="sm" color="warning" variant="flat">
                              Due {formatDate(r.dueAt)}
                            </Chip>
                            <Chip size="sm" variant="flat">
                              {STAGE_LABEL[r.intervalStage] ?? "Review"}
                            </Chip>
                            <Link href="/dashboard" size="sm" showAnchorIcon>
                              View uploads
                            </Link>
                          </div>
                        </div>
                        <Button
                          color="primary"
                          variant="flat"
                          onPress={() => markDone(r)}
                          isLoading={workingKey === key}
                          isDisabled={workingKey !== null}
                          className="sm:w-auto"
                        >
                          Mark done
                        </Button>
                      </CardBody>
                    </Card>
                  );
                })
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
                      Future reviews will appear here once topics are missed.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                upcoming.map((r) => (
                  <Card key={reviewKey(r)} className="p-2">
                    <CardBody className="flex flex-col gap-1.5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[16px]">
                        <span className="font-bold capitalize">{r.topic}</span>
                        <span className="text-default-600">
                          {" "}
                          · {childName(r.childId)} · {r.sourceSheetCode}
                        </span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip size="sm" variant="flat">
                          {STAGE_LABEL[r.intervalStage] ?? "Review"}
                        </Chip>
                        <Chip size="sm" variant="flat">
                          Due {formatDate(r.dueAt)}
                        </Chip>
                      </div>
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
