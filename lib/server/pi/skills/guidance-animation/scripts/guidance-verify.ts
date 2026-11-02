/**
 * The guidance-animation skill's verifier — verification for
 * generated guidance animations, without a browser.
 *
 * The server imports this module (the render_preview and
 * submit_animation tools, and the worker's gate, all run it), and
 * the sibling verify.mjs runs it standalone outside a session, so a
 * draft can be checked anywhere: one implementation, two doors.
 *
 * A generated artefact is untrusted code with a teaching job, so it
 * is executed in jsdom (scripts on, no network, no resource loading)
 * and stepped to its end state while the verifier watches:
 * - static lint: self-containment, the step/play/final contract, no
 *   CSS transforms on SVG (they pivot around the wrong point in real
 *   browsers — SVG transforms belong in transform attributes with an
 *   explicit centre), nothing wider than the frame;
 * - execution: no script errors, and stepping terminates — the
 *   data-step control disables at the end instead of counting on
 *   forever;
 * - truth: the end-state #guidance-final matches the answer key;
 * - geometry: SVG shapes, after their transform attributes are
 *   applied, stay inside the viewBox.
 *
 * What this cannot see: real layout — fonts, text overlap, colours.
 * jsdom has no layout engine. The fixed frame size, the lint rules,
 * and the geometry pass cover the failure classes we have actually
 * shipped; pixel-level checks would need a browser, which the server
 * does not have.
 */

import { JSDOM, VirtualConsole } from "jsdom";

export interface AnimationInspection {
  /** Static contract violations found before/independent of running. */
  lint: string[];
  /** Script errors thrown while loading or stepping. */
  errors: string[];
  /** Visible text snapshot after each step (deduped, capped). */
  stepTexts: string[][];
  /** How many step clicks were performed. */
  stepsTaken: number;
  /** True when the step control disabled itself within the cap. */
  terminated: boolean;
  /** End-state text of #guidance-final, if present. */
  finalText: string | null;
  /** SVG shapes that end up outside their viewBox. */
  geometry: string[];
  /** What pressing Play at the end state does, or null when there
   *  is no play control (a lint failure of its own) or stepping
   *  never terminated. restarted: the lesson visibly starts over.
   *  firstStepMs: when the first played step lands after the
   *  restart — the auto-play pace, sampled at the first step. */
  playback: { restarted: boolean; firstStepMs: number | null } | null;
}

const MAX_STEPS = 40;
const FRAME_WIDTH = 340;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function lintHtml(html: string): string[] {
  const issues: string[] = [];
  if (/(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html) || /<link\b/i.test(html) || /@import/i.test(html)) {
    issues.push("The animation loads external resources — it must be one self-contained file.");
  }
  const widths = [...html.matchAll(/width\s*:\s*(\d{3,})px/gi)].map((m) => Number(m[1]));
  if (widths.some((w) => w > FRAME_WIDTH)) {
    issues.push(`The animation is wider than its ${FRAME_WIDTH}px frame.`);
  }
  return issues;
}

/** CSS transforms on SVG elements pivot around the wrong point in
 *  browsers; the same rotation as a transform attribute with an
 *  explicit centre is exact. Ban the CSS form anywhere an SVG lives. */
function lintCssTransforms(doc: Document): string[] {
  if (!doc.querySelector("svg")) return [];
  const offenders: string[] = [];
  doc.querySelectorAll("svg *").forEach((el) => {
    const style = el.getAttribute("style") ?? "";
    if (/transform\s*:/.test(style)) offenders.push(`inline style on <${el.tagName.toLowerCase()}>`);
  });
  doc.querySelectorAll("style").forEach((el) => {
    if (/transform\s*:/.test(el.textContent ?? "")) offenders.push("a transform rule in a <style> block");
  });
  return offenders.length > 0
    ? [`CSS transforms are used on SVG content (${offenders[0]}) — use transform attributes with an explicit centre instead.`]
    : [];
}

/* ------------------------------------------------------------ geometry */

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function parseTransform(attr: string): Matrix {
  let m = IDENTITY;
  for (const match of attr.matchAll(/(translate|rotate|scale|matrix)\s*\(([^)]*)\)/g)) {
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix = IDENTITY;
    if (match[1] === "translate") t = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
    else if (match[1] === "scale") t = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
    else if (match[1] === "rotate") {
      const rad = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rot: Matrix = [cos, sin, -sin, cos, 0, 0];
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      t = args.length >= 3 ? multiply(multiply([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]) : rot;
    } else if (match[1] === "matrix" && args.length === 6) t = args as Matrix;
    m = multiply(m, t);
  }
  return m;
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function geometryIssues(doc: Document): string[] {
  const issues: string[] = [];
  doc.querySelectorAll("svg").forEach((svg) => {
    const vb = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
    if (vb.length !== 4) return;
    const [vx, vy, vw, vh] = vb;
    const describe = (el: Element) =>
      `<${el.tagName.toLowerCase()}${el.getAttribute("id") ? `#${el.getAttribute("id")}` : ""}>`;
    const walk = (el: Element, parent: Matrix) => {
      const own = el.getAttribute("transform");
      const m = own ? multiply(parent, parseTransform(own)) : parent;
      const num = (name: string, fallback = 0) => Number(el.getAttribute(name) ?? fallback);
      let anchors: [number, number][] | null = null;
      const tag = el.tagName.toLowerCase();
      if (tag === "line") anchors = [[num("x1"), num("y1")], [num("x2"), num("y2")]];
      else if (tag === "circle" || tag === "ellipse") anchors = [[num("cx"), num("cy")]];
      else if (tag === "rect") {
        const [x, y, w, h] = [num("x"), num("y"), num("width"), num("height")];
        anchors = [[x, y], [x + w, y + h]];
      } else if (tag === "text") anchors = [[num("x"), num("y")]];
      if (anchors) {
        for (const [ax, ay] of anchors) {
          const [px, py] = apply(m, ax, ay);
          if (px < vx - 2 || px > vx + vw + 2 || py < vy - 2 || py > vy + vh + 2) {
            issues.push(`${describe(el)} ends up outside the picture (at ${Math.round(px)}, ${Math.round(py)}).`);
            break;
          }
        }
      }
      el.childNodes.forEach((child) => {
        if (child.nodeType === 1) walk(child as Element, m);
      });
    };
    svg.childNodes.forEach((child) => {
      if (child.nodeType === 1) walk(child as Element, IDENTITY);
    });
  });
  return [...new Set(issues)].slice(0, 4);
}

/* ------------------------------------------------------------ execution */

function visibleTexts(doc: Document): string[] {
  const texts: string[] = [];
  doc.querySelectorAll("body *").forEach((el) => {
    if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? "").trim())
      .join(" ");
    if (own) texts.push(own.slice(0, 40));
  });
  return [...new Set(texts)].slice(0, 40);
}

export async function inspectAnimation(html: string): Promise<AnimationInspection> {
  const lint = lintHtml(html);
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(String(e.message ?? e).slice(0, 160)));
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://guidance.invalid/",
    virtualConsole,
  });
  const { window } = dom;
  window.addEventListener("error", (e) => errors.push(String(e.message).slice(0, 160)));
  try {
    await sleep(350);
    const doc = window.document;
    lint.push(...lintCssTransforms(doc));
    if (!doc.querySelector("[data-step]")) lint.push("The animation has no data-step control.");
    if (!doc.querySelector("[data-play]")) lint.push("The animation has no data-play control.");
    if (!doc.getElementById("guidance-final")) lint.push("The animation has no #guidance-final element.");
    const stepTexts: string[][] = [visibleTexts(doc)];
    let stepsTaken = 0;
    let terminated = false;
    const stepper = doc.querySelector("[data-step]") as HTMLButtonElement | null;
    if (stepper) {
      for (let i = 0; i < MAX_STEPS; i++) {
        if ((stepper as HTMLButtonElement).disabled) {
          terminated = true;
          break;
        }
        stepper.click();
        stepsTaken++;
        await sleep(60);
        stepTexts.push(visibleTexts(doc));
      }
      if ((stepper as HTMLButtonElement).disabled) terminated = true;
    }
    await sleep(500);
    const finalEl = doc.getElementById("guidance-final");
    const finalText = finalEl ? finalEl.textContent : null;
    const geometry = geometryIssues(doc);

    // Playback probe: at the end state, press Play. A working Play
    // starts the lesson over — the final answer clears or an early
    // step's text returns — and the first played step lands after
    // a pace a child can follow. A Play that does nothing here, or
    // races, is a defect the step-through above cannot see.
    let playback: AnimationInspection["playback"] = null;
    const playBtn = doc.querySelector("[data-play]") as HTMLButtonElement | null;
    if (playBtn && terminated) {
      const snap = () => JSON.stringify(visibleTexts(doc));
      const endSnap = snap();
      const endFinal = finalEl?.textContent ?? "";
      const earlySnaps = new Set(stepTexts.slice(0, 3).map((s) => JSON.stringify(s)));
      const startedAt = Date.now();
      playBtn.click();
      let prev = endSnap;
      let resetAt: number | null = null;
      let firstStepMs: number | null = null;
      let restarted = false;
      while (Date.now() - startedAt < 3500) {
        await sleep(80);
        const now = snap();
        const finalNow = finalEl?.textContent ?? "";
        if (now === prev && finalNow === (resetAt === null ? endFinal : finalNow)) continue;
        if (now !== prev) {
          const isReset = finalNow !== endFinal || earlySnaps.has(now);
          if (resetAt === null && isReset) {
            resetAt = Date.now() - startedAt;
            restarted = true;
          } else if (resetAt !== null) {
            firstStepMs = Date.now() - startedAt - resetAt;
            break;
          } else {
            // A step landed without a visible reset (the reset only
            // restyled shapes) — its timing is the pace.
            restarted = true;
            firstStepMs = Date.now() - startedAt;
            break;
          }
          prev = now;
        }
      }
      playback = { restarted, firstStepMs };
    }

    return {
      lint,
      errors: [...new Set(errors)].slice(0, 4),
      stepTexts,
      stepsTaken,
      terminated,
      finalText,
      geometry,
      playback,
    };
  } finally {
    window.close();
  }
}

/* --------------------------------------------------------------- the gate */

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

/** The deterministic gate an artefact must pass before it may attach
 *  to a child's result. Fail-closed on every leg. */
export async function verifyAnimation(
  html: string,
  correctAnswer: string,
): Promise<{ ok: boolean; detail: string }> {
  const seen = await inspectAnimation(html);
  if (seen.lint.length > 0) return { ok: false, detail: seen.lint[0] };
  if (seen.errors.length > 0) {
    return { ok: false, detail: `The animation threw script errors: ${seen.errors[0]}` };
  }
  if (!seen.terminated) {
    return {
      ok: false,
      detail: `Stepping does not finish — the step control was still active after ${MAX_STEPS} steps.`,
    };
  }
  if (typeof seen.finalText !== "string" || !seen.finalText.trim()) {
    return { ok: false, detail: "The animation never showed its final answer." };
  }
  if (!answerMatches(seen.finalText, correctAnswer)) {
    return {
      ok: false,
      detail: `The animation ends on "${seen.finalText.trim()}" but the correct answer is "${correctAnswer}".`,
    };
  }
  if (seen.playback && !seen.playback.restarted) {
    return {
      ok: false,
      detail: "Pressing Play once the lesson has finished does nothing — Play must start the lesson over from the beginning.",
    };
  }
  if (seen.playback?.firstStepMs != null && seen.playback.firstStepMs < 900) {
    return {
      ok: false,
      detail: `Auto-play runs too fast (the first step lands after about ${seen.playback.firstStepMs}ms) — steps need about 1.2 seconds each so a child can follow.`,
    };
  }
  if (seen.geometry.length > 0) return { ok: false, detail: seen.geometry[0] };
  return { ok: true, detail: "verified" };
}

/* ------------------------------------------------- practice questions */

/** One practice question submitted with a lesson: the question, its
 *  answer, and the working — the calculation behind the answer, as
 *  arithmetic statements separated by "; ". The working is the
 *  evidence for the answer: the gate evaluates every statement, so
 *  a set is kept only when its own arithmetic proves its answers. */
export interface PracticeQuestionInput {
  prompt: string;
  answer: string;
  working: string;
}

/** Evaluate a small arithmetic expression (+ − × ÷, decimals,
 *  parentheses, $ and commas tolerated) or return null. A tiny
 *  recursive-descent parser — no eval, nothing executed. */
function evalArith(raw: string): number | null {
  const s = raw.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/").replace(/[$,]/g, "");
  let i = 0;
  const skip = () => {
    while (s[i] === " ") i++;
  };
  function parseExpr(): number | null {
    let v = parseTerm();
    if (v === null) return null;
    for (;;) {
      skip();
      if (s[i] !== "+" && s[i] !== "-") return v;
      const op = s[i++];
      const r = parseTerm();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
  }
  function parseTerm(): number | null {
    let v = parseFactor();
    if (v === null) return null;
    for (;;) {
      skip();
      if (s[i] !== "*" && s[i] !== "/" && s[i] !== "x" && s[i] !== "X") return v;
      const op = s[i++];
      const r = parseFactor();
      if (r === null) return null;
      v = op === "/" ? v / r : v * r;
    }
  }
  function parseFactor(): number | null {
    skip();
    if (s[i] === "(") {
      i++;
      const v = parseExpr();
      skip();
      if (v === null || s[i] !== ")") return null;
      i++;
      return v;
    }
    if (s[i] === "-") {
      i++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  }
  const v = parseExpr();
  skip();
  return v !== null && i >= s.length ? v : null;
}

/** The numeric value an answer carries, or null when it has none
 *  ("$1.98" → 1.98, "26 cm" → 26, "B" → null). */
function numericValueOf(text: string): number | null {
  const m = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const PRACTICE_TOLERANCE = 0.011;

/**
 * The deterministic gate for a lesson's practice questions. The app
 * checks a child's answers against these, so a wrong answer here
 * would mark a right answer wrong: fail-closed, like the lesson
 * gate. Exactly 5 questions, none repeating another or the lesson's
 * own question; every question whose answer is a number must carry
 * a working whose every statement is true and whose last statement
 * lands exactly on the answer. A question whose answer is not a
 * number cannot be proven this way and is accepted on its face —
 * the generator is steered to computable questions.
 */
export function validatePracticeQuestions(
  practice: unknown,
  anchorPrompt: string,
): { ok: boolean; detail: string } {
  if (!Array.isArray(practice) || practice.length !== 5) {
    return { ok: false, detail: "Submit exactly 5 practice questions with the lesson." };
  }
  const normPrompt = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set<string>([normPrompt(anchorPrompt)]);
  for (let idx = 0; idx < practice.length; idx++) {
    const item = practice[idx] as Partial<PracticeQuestionInput> | null;
    const label = `Practice question ${idx + 1}`;
    if (!item || typeof item.prompt !== "string" || typeof item.answer !== "string") {
      return { ok: false, detail: `${label} is missing its prompt or answer.` };
    }
    const prompt = item.prompt.trim();
    const answer = item.answer.trim();
    if (prompt.length < 3 || prompt.length > 240) {
      return { ok: false, detail: `${label}'s prompt is empty or too long.` };
    }
    if (answer.length < 1 || answer.length > 48) {
      return { ok: false, detail: `${label}'s answer is empty or too long.` };
    }
    if (seen.has(normPrompt(prompt))) {
      return {
        ok: false,
        detail: `${label} repeats another question (or the lesson's own question) — every practice question must be its own question.`,
      };
    }
    seen.add(normPrompt(prompt));
    const answerValue = numericValueOf(answer);
    if (answerValue === null) continue;
    const working = typeof item.working === "string" ? item.working : "";
    const statements = working.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);
    if (statements.length === 0) {
      return {
        ok: false,
        detail: `${label} ("${prompt}") has the numeric answer "${answer}" but no working — submit the calculation behind it, as statements separated by "; ".`,
      };
    }
    let lastResult: number | null = null;
    for (const statement of statements) {
      const parts = statement.split("=");
      if (parts.length !== 2 || !/[+\-−×x*÷/]/.test(parts[0])) {
        return {
          ok: false,
          detail: `${label}'s working statement "${statement}" is not a calculation of the form "6 + 3 = 9".`,
        };
      }
      const lhs = evalArith(parts[0]);
      const rhs = numericValueOf(parts[1]);
      if (lhs === null || rhs === null) {
        return {
          ok: false,
          detail: `${label}'s working statement "${statement}" could not be evaluated — keep the working to plain arithmetic.`,
        };
      }
      if (Math.abs(lhs - rhs) > PRACTICE_TOLERANCE) {
        return {
          ok: false,
          detail: `${label}'s working says "${statement}" but the left side comes to ${Math.round(lhs * 100) / 100}. Fix the working or the answer.`,
        };
      }
      lastResult = rhs;
    }
    if (lastResult === null || Math.abs(lastResult - answerValue) > PRACTICE_TOLERANCE) {
      return {
        ok: false,
        detail: `${label}'s working ends at ${lastResult} but its answer is "${answer}" — the last statement of the working must land on the answer.`,
      };
    }
  }
  return { ok: true, detail: "verified" };
}
