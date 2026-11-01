/**
 * lib/server/guidance-store.ts — where guidance tasks live, behind
 * one interface with two backends.
 *
 * Live mode: the guidance_animations table (Supabase), read and
 * written with the service-role client — operator machinery; the
 * rows hold question identity and generated content, never parent or
 * kid data. Demo mode: an in-memory map on the same lifecycle, gone
 * when the server restarts, which is fine for a demo. The worker
 * (lib/server/guidance-worker.ts) claims from both through this
 * interface, so the processing pipeline never knows which backend a
 * task came from.
 *
 * Lifecycle, both backends: pending → processing (claimed, leased)
 * → ready (terminal, html stored) or back to pending with backoff
 * on failure; terminally failed at MAX_ATTEMPTS generation failures.
 * A claim whose lease expires returns to pending without consuming
 * an attempt — the failure was the worker's, not the artefact's.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase";

export type GuidanceViewStatus = "generating" | "ready" | "failed";

export interface GuidanceView {
  status: GuidanceViewStatus;
  html?: string;
  error?: string;
}

export interface GuidanceTask {
  id: string;
  printedCode: string;
  questionNumber: number;
  keyVersion: number;
  /** Generation failures so far (claims do not count). */
  attempts: number;
  /** The previous attempt's failure — fed back into the next
   *  generation so it can fix exactly that. */
  lastError: string | null;
  claimedBy: string;
}

export interface GuidanceStore {
  /** The artefact state for one question, or null when no task exists. */
  get(printedCode: string, questionNumber: number, keyVersion: number): Promise<GuidanceView | null>;
  /** Insert-if-absent: enqueueing a question that already has a task
   *  (in any state) changes nothing. */
  enqueue(printedCode: string, questionNumber: number, keyVersion: number, priority: number): Promise<void>;
  /** Claim up to `limit` due tasks for `workerId`. */
  claim(workerId: string, limit: number, leaseSeconds: number): Promise<GuidanceTask[]>;
  complete(task: GuidanceTask, html: string): Promise<void>;
  /** Record a generation failure: attempts + 1, backoff, terminal at
   *  the attempt bound. */
  fail(task: GuidanceTask, error: string): Promise<void>;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [5 * 60_000, 30 * 60_000];

function viewOf(status: string, html: string | null, error: string | null): GuidanceView {
  if (status === "ready") return { status: "ready", html: html ?? undefined };
  if (status === "failed") return { status: "failed", error: error ?? undefined };
  return { status: "generating" };
}

/* ------------------------------------------------------------------ DB */

interface GuidanceRow {
  id: string;
  printed_code: string;
  question_number: number;
  key_version: number;
  status: string;
  html: string | null;
  attempts: number;
  claim_count: number;
  last_error: string | null;
  priority: number;
  available_at: string;
  lease_until: string | null;
  claimed_by: string | null;
  created_at: string;
  updated_at: string;
}

class DbGuidanceStore implements GuidanceStore {
  private db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }

  private triple(printedCode: string, questionNumber: number, keyVersion: number) {
    return { printed_code: printedCode, question_number: questionNumber, key_version: keyVersion };
  }

  async get(printedCode: string, questionNumber: number, keyVersion: number): Promise<GuidanceView | null> {
    const { data } = await this.db
      .from("guidance_animations")
      .select("status, html, last_error")
      .match(this.triple(printedCode, questionNumber, keyVersion))
      .maybeSingle();
    if (!data) return null;
    return viewOf(data.status, data.html, data.last_error);
  }

  async enqueue(printedCode: string, questionNumber: number, keyVersion: number, priority: number): Promise<void> {
    await this.db.from("guidance_animations").upsert(
      { ...this.triple(printedCode, questionNumber, keyVersion), priority },
      { onConflict: "printed_code,question_number,key_version", ignoreDuplicates: true },
    );
  }

  async claim(workerId: string, limit: number, leaseSeconds: number): Promise<GuidanceTask[]> {
    const { data, error } = await this.db.rpc("claim_guidance_tasks", {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    if (error) {
      console.error("guidance claim failed:", error.message);
      return [];
    }
    return ((data ?? []) as GuidanceRow[]).map((r) => ({
      id: r.id,
      printedCode: r.printed_code,
      questionNumber: r.question_number,
      keyVersion: r.key_version,
      attempts: r.attempts,
      lastError: r.last_error,
      claimedBy: workerId,
    }));
  }

  async complete(task: GuidanceTask, html: string): Promise<void> {
    await this.db
      .from("guidance_animations")
      .update({ status: "ready", html, last_error: null, claimed_by: null, lease_until: null, updated_at: new Date().toISOString() })
      .match({ id: task.id, claimed_by: task.claimedBy, status: "processing" });
  }

  async fail(task: GuidanceTask, error: string): Promise<void> {
    const attempts = task.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    await this.db
      .from("guidance_animations")
      .update({
        status: terminal ? "failed" : "pending",
        attempts,
        last_error: error,
        available_at: new Date(Date.now() + (terminal ? 0 : BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)])).toISOString(),
        claimed_by: null,
        lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .match({ id: task.id, claimed_by: task.claimedBy, status: "processing" });
  }
}

/* --------------------------------------------------------------- memory */

interface MemoryRow {
  id: string;
  printedCode: string;
  questionNumber: number;
  keyVersion: number;
  status: "pending" | "processing" | "ready" | "failed";
  html: string | null;
  attempts: number;
  claimCount: number;
  lastError: string | null;
  priority: number;
  availableAt: number;
  leaseUntil: number | null;
  claimedBy: string | null;
  createdAt: number;
}

type GlobalWithMemoryGuidance = typeof globalThis & { __guidanceMemory?: Map<string, MemoryRow> };
const memoryRows: Map<string, MemoryRow> = ((globalThis as GlobalWithMemoryGuidance).__guidanceMemory ??= new Map());
let memorySeq = 0;

const memoryKey = (c: string, q: number, kv: number) => `${c}#${q}#${kv}`;

export class MemoryGuidanceStore implements GuidanceStore {
  async get(printedCode: string, questionNumber: number, keyVersion: number): Promise<GuidanceView | null> {
    const row = memoryRows.get(memoryKey(printedCode, questionNumber, keyVersion));
    return row ? viewOf(row.status, row.html, row.lastError) : null;
  }

  async enqueue(printedCode: string, questionNumber: number, keyVersion: number, priority: number): Promise<void> {
    const key = memoryKey(printedCode, questionNumber, keyVersion);
    if (memoryRows.has(key)) return;
    memoryRows.set(key, {
      id: `mem-${++memorySeq}`,
      printedCode,
      questionNumber,
      keyVersion,
      status: "pending",
      html: null,
      attempts: 0,
      claimCount: 0,
      lastError: null,
      priority,
      availableAt: Date.now(),
      leaseUntil: null,
      claimedBy: null,
      createdAt: Date.now(),
    });
  }

  async claim(workerId: string, limit: number, leaseSeconds: number): Promise<GuidanceTask[]> {
    const now = Date.now();
    for (const row of memoryRows.values()) {
      if (row.status === "processing" && row.leaseUntil !== null && row.leaseUntil <= now) {
        if (row.claimCount >= 5) {
          row.status = "failed";
          row.lastError = "Claimed too many times without finishing.";
        } else {
          row.status = "pending";
        }
        row.claimedBy = null;
        row.leaseUntil = null;
      }
    }
    const due = [...memoryRows.values()]
      .filter((r) => r.status === "pending" && r.availableAt <= now)
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
      .slice(0, limit);
    return due.map((row) => {
      row.status = "processing";
      row.claimedBy = workerId;
      row.claimCount += 1;
      row.leaseUntil = now + leaseSeconds * 1000;
      return {
        id: row.id,
        printedCode: row.printedCode,
        questionNumber: row.questionNumber,
        keyVersion: row.keyVersion,
        attempts: row.attempts,
        lastError: row.lastError,
        claimedBy: workerId,
      };
    });
  }

  async complete(task: GuidanceTask, html: string): Promise<void> {
    const row = this.rowFor(task);
    if (!row) return;
    row.status = "ready";
    row.html = html;
    row.lastError = null;
    row.claimedBy = null;
    row.leaseUntil = null;
  }

  async fail(task: GuidanceTask, error: string): Promise<void> {
    const row = this.rowFor(task);
    if (!row) return;
    const attempts = task.attempts + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    row.attempts = attempts;
    row.status = terminal ? "failed" : "pending";
    row.lastError = error;
    row.availableAt = Date.now() + (terminal ? 0 : BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]);
    row.claimedBy = null;
    row.leaseUntil = null;
  }

  private rowFor(task: GuidanceTask): MemoryRow | null {
    const row = memoryRows.get(memoryKey(task.printedCode, task.questionNumber, task.keyVersion));
    return row && row.id === task.id && row.claimedBy === task.claimedBy ? row : null;
  }
}

/* ------------------------------------------------------------- selection */

let dbStore: DbGuidanceStore | null | undefined;
let memoryStore: MemoryGuidanceStore | null = null;

/** The live backend, or null when Supabase/the service key is absent. */
export function dbGuidanceStore(): GuidanceStore | null {
  if (dbStore === undefined) {
    const admin = supabaseAdmin();
    dbStore = admin ? new DbGuidanceStore(admin) : null;
  }
  return dbStore;
}

export function memoryGuidanceStore(): GuidanceStore {
  return (memoryStore ??= new MemoryGuidanceStore());
}
