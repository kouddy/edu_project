/**
 * lib/server/guidance-worker.ts — the in-process guidance worker.
 *
 * Started once at server startup (instrumentation.ts). Every poll
 * it claims due tasks from each store — the DB in live mode, memory
 * in demo — up to the concurrency cap, and runs each through the
 * processing unit (harness session + gate). Claims are leased: a
 * task whose worker disappears returns to pending when the lease
 * expires, so a restart loses nothing but a little time. The loop's
 * timer is unref'd — the worker never keeps a process alive on its
 * own (builds and tests exit normally).
 */

import { processGuidanceTask } from "./guidance";
import {
  dbGuidanceStore,
  memoryGuidanceStore,
  type GuidanceStore,
  type GuidanceTask,
} from "./guidance-store";

const LEASE_SECONDS = 900;

type GlobalWithWorker = typeof globalThis & { __guidanceWorkerStarted?: boolean };

export interface GuidanceWorkerOptions {
  stores?: GuidanceStore[];
  processor?: (task: GuidanceTask) => Promise<string>;
  pollMs?: number;
  concurrency?: number;
}

export function startGuidanceWorker(opts: GuidanceWorkerOptions = {}): void {
  const globalRef = globalThis as GlobalWithWorker;
  if (globalRef.__guidanceWorkerStarted) return;
  if (process.env.GUIDANCE_WORKER === "off") {
    console.log("[guidance] worker disabled (GUIDANCE_WORKER=off)");
    return;
  }
  globalRef.__guidanceWorkerStarted = true;

  const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const pollMs = opts.pollMs ?? Number(process.env.GUIDANCE_POLL_MS ?? 15_000);
  const concurrency = opts.concurrency ?? Number(process.env.GUIDANCE_CONCURRENCY ?? 2);
  const processor = opts.processor ?? processGuidanceTask;
  const stores =
    opts.stores ??
    [dbGuidanceStore(), memoryGuidanceStore()].filter(
      (s): s is GuidanceStore => s !== null,
    );

  let inFlight = 0;
  let ticking = false;

  const runTask = async (store: GuidanceStore, task: GuidanceTask) => {
    const label = `${task.printedCode}#${task.questionNumber}`;
    try {
      const html = await processor(task);
      await store.complete(task, html);
      console.log(`[guidance] ${label} ready`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Guidance generation failed.";
      await store.fail(task, message);
      console.log(`[guidance] ${label} attempt failed: ${message}`);
    } finally {
      inFlight--;
    }
  };

  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      for (const store of stores) {
        const capacity = concurrency - inFlight;
        if (capacity <= 0) break;
        const tasks = await store.claim(workerId, capacity, LEASE_SECONDS);
        for (const task of tasks) {
          inFlight++;
          void runTask(store, task);
        }
      }
    } catch (err) {
      console.error("[guidance] worker tick failed:", err instanceof Error ? err.message : err);
    } finally {
      ticking = false;
    }
  };

  const timer = setInterval(() => void tick(), pollMs);
  timer.unref?.();
  void tick();
  console.log(
    `[guidance] worker started (${workerId}, poll ${pollMs}ms, concurrency ${concurrency}, ${stores.length} store(s))`,
  );
}
