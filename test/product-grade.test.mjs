import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Contract tests for the /api/grade pipeline (src/lib/product-grade.ts):
// verdict mapping, the 80% never-guess rule, confident-only scoring,
// photo rejection, and exactly-one retry. The TS sources are compiled with
// the repo's own typescript into a temp dir, then imported as plain JS.

const SHEET = {
  sheetCode: "G9-TEST",
  grade: 4,
  subject: "math",
  week: "week-1",
  questions: [
    { questionNumber: 1, prompt: "1 + 1", correctAnswer: "2", topic: "addition" },
    { questionNumber: 2, prompt: "2 + 2", correctAnswer: "4", topic: "addition" },
    { questionNumber: 3, prompt: "3 + 3", correctAnswer: "6", topic: "addition" },
  ],
};

function visionResponse(payload) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  };
}

let lib;
let workdir;
const realFetch = globalThis.fetch;
const savedEnv = {
  url: process.env.MUSE_SPARK_API_URL,
  key: process.env.MUSE_SPARK_API_KEY,
};

before(async () => {
  workdir = mkdtempSync(join(tmpdir(), "product-grade-test-"));
  execFileSync(
    "node_modules/.bin/tsc",
    [
      "--module",
      "commonjs",
      "--target",
      "es2020",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--outDir",
      workdir,
      "src/lib/product-grade.ts",
    ],
    { stdio: "pipe" }
  );
  const mod = await import(pathToFileURL(join(workdir, "product-grade.js")).href);
  lib = mod.default ?? mod;
});

after(() => {
  globalThis.fetch = realFetch;
  if (savedEnv.url === undefined) delete process.env.MUSE_SPARK_API_URL;
  else process.env.MUSE_SPARK_API_URL = savedEnv.url;
  if (savedEnv.key === undefined) delete process.env.MUSE_SPARK_API_KEY;
  else process.env.MUSE_SPARK_API_KEY = savedEnv.key;
  rmSync(workdir, { recursive: true, force: true });
});

describe("product grading contract", () => {
  it("prompt keeps the rules and embeds the answer key", () => {
    const prompt = lib.productGradingPrompt(SHEET);
    assert.match(prompt, /80%/);
    assert.match(prompt, /never guess/i);
    assert.match(prompt, /unsure/i);
    for (const q of SHEET.questions) {
      assert.ok(prompt.includes(q.prompt), `prompt mentions ${q.prompt}`);
      assert.ok(
        prompt.includes(q.correctAnswer),
        `prompt mentions ${q.correctAnswer}`
      );
    }
  });

  it("maps verdicts and forces low confidence to unsure", () => {
    const out = lib.parseProductPayload(
      {
        results: [
          { question_number: 1, answer_read: "2", verdict: "correct", confidence: 0.95 },
          {
            question_number: 2,
            answer_read: "5",
            verdict: "incorrect",
            confidence: 0.9,
            explanation: "Close — 2 + 2 makes 4.",
          },
          { question_number: 3, answer_read: "6", verdict: "correct", confidence: 0.5 },
        ],
      },
      3
    );
    assert.equal(out.rejected, false);
    assert.equal(out.perQuestion[0].verdict, "correct");
    assert.equal(out.perQuestion[0].correct, true);
    assert.equal(out.perQuestion[1].verdict, "incorrect");
    assert.equal(out.perQuestion[1].correct, false);
    assert.equal(out.perQuestion[1].modelReading, "5");
    assert.equal(out.perQuestion[1].explanation, "Close — 2 + 2 makes 4.");
    // 0.5 < 0.8: never-guess rule flips it to unsure server-side.
    assert.equal(out.perQuestion[2].verdict, "unsure");
    assert.equal(out.perQuestion[2].correct, false);
    // Score counts only confident verdicts: 1 correct of 2 decisive.
    assert.equal(out.score, 0.5);
  });

  it("fills missing/invalid questions as unsure", () => {
    const out = lib.parseProductPayload(
      {
        results: [
          { question_number: 1, answer_read: "2", verdict: "correct", confidence: 0.99 },
          { question_number: 2, answer_read: "x", verdict: "bogus", confidence: 0.99 },
        ],
      },
      3
    );
    assert.equal(out.rejected, false);
    assert.equal(out.perQuestion[1].verdict, "unsure");
    assert.equal(out.perQuestion[2].verdict, "unsure");
    assert.equal(out.perQuestion[2].modelReading, null);
    assert.equal(out.perQuestion[2].confidence, 0);
    assert.equal(out.score, 1);
  });

  it("parses photo rejection with a parent-readable reason", () => {
    const out = lib.parseProductPayload(
      { photo_rejected: true, reason: "Too blurry, please retake." },
      3
    );
    assert.equal(out.rejected, true);
    assert.equal(out.reason, "Too blurry, please retake.");

    const fallback = lib.parseProductPayload({ photo_rejected: true }, 3);
    assert.equal(fallback.rejected, true);
    assert.ok(fallback.reason.length > 0);
  });

  it("scores zero when nothing is confidently graded", () => {
    assert.equal(
      lib.scoreConfident([
        { questionNumber: 1, correct: false, verdict: "unsure", confidence: 0.2, modelReading: null },
      ]),
      0
    );
  });

  it("retries the vision call once, then succeeds", async () => {
    process.env.MUSE_SPARK_API_URL = "https://vision.test/chat/completions";
    process.env.MUSE_SPARK_API_KEY = "test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return visionResponse({
        results: [
          { question_number: 1, answer_read: "2", verdict: "correct", confidence: 0.99 },
        ],
      });
    };
    try {
      const { demo, outcome } = await lib.gradeProductPhoto(
        SHEET,
        Buffer.alloc(9000),
        "image/jpeg"
      );
      assert.equal(demo, false);
      assert.equal(calls, 2);
      assert.equal(outcome.rejected, false);
      assert.equal(outcome.perQuestion[0].verdict, "correct");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("throws after the retry is exhausted", async () => {
    process.env.MUSE_SPARK_API_URL = "https://vision.test/chat/completions";
    process.env.MUSE_SPARK_API_KEY = "test-key";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("still down");
    };
    try {
      await assert.rejects(() =>
        lib.gradeProductPhoto(SHEET, Buffer.alloc(9000), "image/jpeg")
      );
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("falls back to all-unsure demo mode without a key", async () => {
    delete process.env.MUSE_SPARK_API_URL;
    delete process.env.MUSE_SPARK_API_KEY;
    const { demo, outcome } = await lib.gradeProductPhoto(
      SHEET,
      Buffer.alloc(9000),
      "image/jpeg"
    );
    assert.equal(demo, true);
    assert.equal(outcome.rejected, false);
    assert.ok(outcome.perQuestion.every((q) => q.verdict === "unsure"));
    assert.equal(outcome.score, 0);
  });
});
