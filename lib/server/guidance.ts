/**
 * lib/server/guidance.ts — animated guidance for wrong answers,
 * generated on demand and never on the grading path.
 *
 * When a sheet settles with a wrong answer, a guidance job is queued
 * for that question. The job asks the configured provider for one
 * self-contained HTML animation built from the question's own numbers
 * (the registry key is the ground truth — the model illustrates given
 * math, it does not invent it), then verifies the artefact before it
 * may attach to a result: the file is rendered headlessly, stepped to
 * its end state, and the final displayed answer must match the key.
 * An artefact that fails verification is regenerated once with the
 * failure noted; a second failure leaves the question with its text
 * guidance. Verified artefacts are cached per question, so each
 * question is generated at most once per server run.
 *
 * Generation contract (what the model is told, and the verifier
 * relies on):
 * - one self-contained HTML document, inline CSS/JS, no external URLs;
 * - a button with the attribute data-step advances exactly one step
 *   per click and is disabled at the final step; a button with
 *   data-play auto-plays;
 * - the final answer appears, at the end state only, in the element
 *   with id "guidance-final", as exactly the correct-answer string.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiQuestionGrade } from "../grade-contract";
import {
  effectiveModel,
  loadPiConfig,
  providerDef,
  providerForAgent,
  resolveProviderApiKey,
} from "./pi-config";
import { findByPrintedCode } from "./registry";

export type GuidanceStatus = "generating" | "verifying" | "ready" | "failed";

export interface GuidanceRecord {
  key: string;
  printedCode: string;
  questionNumber: number;
  status: GuidanceStatus;
  html?: string;
  error?: string;
  attempts: number;
  updatedAt: number;
}

type GlobalWithGuidance = typeof globalThis & {
  __guidance?: Map<string, GuidanceRecord>;
};
const records: Map<string, GuidanceRecord> = ((globalThis as GlobalWithGuidance).__guidance ??=
  new Map());

const MAX_GENERATION_ATTEMPTS = 2;

export function guidanceKey(printedCode: string, questionNumber: number): string {
  return `${printedCode}#${questionNumber}`;
}

export function getGuidance(
  printedCode: string,
  questionNumber: number,
): GuidanceRecord | null {
  return records.get(guidanceKey(printedCode, questionNumber)) ?? null;
}

/** Queue generation for one question. No-ops when an artefact is
 *  ready or a job is already running; a failed record re-queues only
 *  when forced (an explicit regenerate request). When `html` is
 *  supplied it skips generation and goes straight to verification —
 *  the pre-generation and testing path. */
export function enqueueGuidance(
  printedCode: string,
  questionNumber: number,
  opts?: { html?: string; force?: boolean },
): GuidanceRecord | null {
  const entry = findByPrintedCode(printedCode);
  const question = entry?.questions.find((q) => q.number === questionNumber);
  if (!entry || !question) return null;
  const key = guidanceKey(printedCode, questionNumber);
  const existing = records.get(key);
  if (
    existing &&
    (existing.status === "ready" ||
      existing.status === "generating" ||
      existing.status === "verifying" ||
      (existing.status === "failed" && !opts?.force))
  ) {
    return existing;
  }
  const record: GuidanceRecord = {
    key,
    printedCode,
    questionNumber,
    status: opts?.html ? "verifying" : "generating",
    attempts: 0,
    updatedAt: Date.now(),
  };
  records.set(key, record);
  void runGuidanceJob(record, question.prompt, question.correctAnswer, opts?.html);
  return record;
}

/** Queue guidance for every final wrong answer on a settled sheet.
 *  Unsure answers wait for the parent's check — guidance built on a
 *  misread number would teach the wrong lesson. Fire-and-forget: a
 *  guidance failure must never surface in grading. */
export function enqueueGuidanceForSheet(
  printedCode: string,
  perQuestion: ApiQuestionGrade[],
): void {
  try {
    for (const g of perQuestion) {
      if (g.verdict === "wrong") enqueueGuidance(printedCode, g.questionNumber);
    }
  } catch (err) {
    console.error("guidance enqueue failed:", err instanceof Error ? err.message : err);
  }
}

async function runGuidanceJob(
  record: GuidanceRecord,
  prompt: string,
  correctAnswer: string,
  suppliedHtml?: string,
): Promise<void> {
  let failureNote: string | undefined;
  try {
    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      record.attempts = attempt;
      let html = suppliedHtml;
      if (!html) {
        record.status = "generating";
        record.updatedAt = Date.now();
        html = await generateGuidanceHtml(prompt, correctAnswer, failureNote);
      }
      record.status = "verifying";
      record.updatedAt = Date.now();
      const verdict = await verifyGuidanceHtml(html, correctAnswer);
      if (verdict.ok) {
        record.html = html;
        record.status = "ready";
        record.error = undefined;
        record.updatedAt = Date.now();
        console.log(`[guidance] ${record.key} ready (attempt ${attempt})`);
        return;
      }
      failureNote = verdict.detail;
      console.log(`[guidance] ${record.key} verification failed (attempt ${attempt}): ${verdict.detail}`);
      if (suppliedHtml) break; // a supplied artefact gets one verdict, no regeneration
    }
    record.status = "failed";
    record.error = failureNote ?? "Guidance generation failed.";
    record.updatedAt = Date.now();
  } catch (err) {
    record.status = "failed";
    record.error = err instanceof Error ? err.message : "Guidance generation failed.";
    record.updatedAt = Date.now();
    console.error(`[guidance] ${record.key} failed:`, record.error);
  }
}

/* ---------------------------------------------------------- generation */

function guidancePrompt(prompt: string, correctAnswer: string, failureNote?: string): string {
  return [
    "You make a tiny animated lesson that shows a child how to solve one math question they got wrong.",
    "Output ONLY one complete, self-contained HTML document: inline <style> and <script>, no external URLs, no markdown fences, no explanation text.",
    "",
    `Question: ${prompt}`,
    `Correct answer: ${correctAnswer}`,
    "",
    "Rules:",
    "- Teach by showing the working with the question's own numbers. Very few words; big clear numbers.",
    "- The animation advances in small steps. Include a button with the attribute data-step that advances exactly one step per click and becomes disabled at the final step, and a button with the attribute data-play that plays all steps automatically.",
    `- Include an element with id "guidance-final" that stays empty until the final step, when its text becomes exactly: ${correctAnswer}`,
    "- Every number the animation displays must agree with the working — a running total must never show a value the steps did not produce, and stepping past the end must be impossible.",
    "- Page style: background #fff8ec, text #3d2b1f, accent #e8710a, rounded friendly shapes, system fonts. The page is shown in a frame 340px wide and 380px tall: lay out with width:100% inside that box, with no scrolling in either direction.",
    ...(failureNote
      ? ["", `A previous attempt failed verification: ${failureNote}. Fix exactly that.`]
      : []),
  ].join("\n");
}

async function generateGuidanceHtml(
  prompt: string,
  correctAnswer: string,
  failureNote?: string,
): Promise<string> {
  const config = loadPiConfig();
  const providerId = process.env.GUIDANCE_PROVIDER ?? providerForAgent(config, "math");
  const def = providerDef(config, providerId);
  if (!def) throw new Error(`Guidance provider "${providerId}" is not defined.`);
  if (def.api !== "openai-responses") {
    throw new Error(
      `Guidance generation is not wired for provider "${providerId}" (api "${def.api}") yet.`,
    );
  }
  const apiKey = resolveProviderApiKey(config, providerId);
  const model = effectiveModel(config, "math", providerId);
  const res = await fetch(`${def.baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      input: guidancePrompt(prompt, correctAnswer, failureNote),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Guidance provider returned HTTP ${res.status}.`);
  const data = (await res.json()) as {
    output_text?: string;
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  const text =
    data.output_text ??
    (data.output ?? [])
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text" || typeof c.text === "string")
      .map((c) => c.text ?? "")
      .join("");
  const html = text.replace(/```(?:html)?/g, "").trim();
  if (!html.includes("<html") && !html.includes("<!DOCTYPE")) {
    throw new Error("Guidance provider did not return an HTML document.");
  }
  return html;
}

/* --------------------------------------------------------- verification */

function chromePath(): string | null {
  const candidates = [
    process.env.GUIDANCE_CHROME_PATH,
    "/home/hatch/workspace/course-materials/grade2-math/chrome/chrome-linux64/chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((c) => c && existsSync(c)) ?? null;
}

function answerMatches(finalText: string, correctAnswer: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[\s,]+/g, "");
  const f = norm(finalText);
  const a = norm(correctAnswer);
  if (!f || !a) return false;
  if (f.includes(a)) return true;
  // "26 cm" in the key vs a bare "26" on stage (and vice versa).
  const core = a.match(/\d+(?:\.\d+)?(?:\/\d+)?/);
  return core ? f === core[0] || f.includes(core[0]) : false;
}

/** Render the artefact headlessly, step it to its end state, and
 *  require: no script errors, a data-step control that finishes, and
 *  a #guidance-final whose end-state text matches the key. */
async function verifyGuidanceHtml(
  html: string,
  correctAnswer: string,
): Promise<{ ok: boolean; detail: string }> {
  const chrome = chromePath();
  if (!chrome) return { ok: false, detail: "No Chrome available to verify the animation." };
  const dir = mkdtempSync(path.join(tmpdir(), "guidance-verify-"));
  const file = path.join(dir, "guidance.html");
  writeFileSync(file, html);
  const port = 9500 + Math.floor(Math.random() * 400);
  const proc: ChildProcess = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${port}`,
      "--window-size=340,420",
      `--user-data-dir=${path.join(dir, "profile")}`,
      "--no-first-run",
      "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    let ws: WebSocket | null = null;
    for (let i = 0; i < 40 && !ws; i++) {
      try {
        const r = await fetch(
          `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`file://${file}`)}`,
          { method: "PUT" },
        );
        const j = (await r.json()) as { webSocketDebuggerUrl?: string };
        if (j.webSocketDebuggerUrl) {
          ws = new WebSocket(j.webSocketDebuggerUrl);
          await new Promise((res, rej) => {
            ws!.addEventListener("open", res, { once: true });
            ws!.addEventListener("error", rej, { once: true });
          });
        }
      } catch {
        await sleep(300);
      }
    }
    if (!ws) return { ok: false, detail: "Verification browser did not start." };
    const exceptions: string[] = [];
    let nextId = 0;
    const pending = new Map<number, (m: Record<string, unknown>) => void>();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data)) as {
        id?: number;
        method?: string;
        params?: { exceptionDetails?: { text?: string } };
      };
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)!(m as Record<string, unknown>);
        pending.delete(m.id);
      } else if (m.method === "Runtime.exceptionThrown") {
        exceptions.push(m.params?.exceptionDetails?.text ?? "script error");
      }
    });
    const send = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<Record<string, unknown>>((res) => {
        const id = ++nextId;
        pending.set(id, res);
        ws!.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression: string): Promise<unknown> => {
      const r = (await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
      })) as { result?: { result?: { value?: unknown } } };
      return r.result?.result?.value;
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await sleep(1200);
    if (!(await evaluate(`!!document.querySelector('[data-step]')`))) {
      return { ok: false, detail: "The animation has no data-step control." };
    }
    for (let i = 0; i < 40; i++) {
      const advanced = await evaluate(
        `(() => { const b = document.querySelector('[data-step]'); if (!b || b.disabled) return false; b.click(); return true; })()`,
      );
      if (!advanced) break;
      await sleep(160);
    }
    await sleep(700);
    const finalText = await evaluate(
      `document.getElementById('guidance-final')?.textContent ?? null`,
    );
    if (exceptions.length > 0) {
      return { ok: false, detail: `The animation threw script errors: ${exceptions[0]}` };
    }
    if (typeof finalText !== "string" || !finalText.trim()) {
      return { ok: false, detail: "The animation never showed its final answer." };
    }
    if (!answerMatches(finalText, correctAnswer)) {
      return {
        ok: false,
        detail: `The animation ends on "${finalText.trim()}" but the correct answer is "${correctAnswer}".`,
      };
    }
    // The frame in the app is fixed, so an artefact that overflows it
    // shows scrollbars or clipped teaching — a numeric pass is not
    // enough if the picture does not fit.
    const overflow = (await evaluate(
      `(() => { const el = document.scrollingElement; return { w: el.scrollWidth - window.innerWidth, h: el.scrollHeight - 380 }; })()`,
    )) as { w: number; h: number } | undefined;
    if (overflow && (overflow.w > 1 || overflow.h > 1)) {
      return {
        ok: false,
        detail: `The animation overflows its frame (${Math.max(0, overflow.w)}px wide, ${Math.max(0, overflow.h)}px tall).`,
      };
    }
    return { ok: true, detail: "verified" };
  } finally {
    try {
      if (proc.pid) process.kill(-proc.pid, "SIGKILL");
    } catch {
      proc.kill("SIGKILL");
    }
    rmSync(dir, { recursive: true, force: true });
  }
}
