import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Contract tests for the server-owned sheet catalog (src/lib/store.ts,
// data/sheets.json): the single source of truth for worksheets and answer
// keys. Both the browser-seeded G3 sheet and the Grade 4 sheet must be
// present in product shape and resolvable by sheet code. The TS source is
// compiled with the repo's own typescript into a temp dir, then imported.

let lib;
let workdir;

before(async () => {
  workdir = mkdtempSync(join(tmpdir(), "sheets-test-"));
  execFileSync(
    "node_modules/.bin/tsc",
    [
      "--module",
      "commonjs",
      "--target",
      "es2020",
      "--moduleResolution",
      "node",
      "--esModuleInterop",
      "--skipLibCheck",
      "--outDir",
      workdir,
      "src/lib/store.ts",
    ],
    { stdio: "pipe" }
  );
  const mod = await import(pathToFileURL(join(workdir, "store.js")).href);
  lib = mod.default ?? mod;
});

after(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("server sheet catalog", () => {
  it("loads the G3 and G4 sheets in product shape", async () => {
    const sheets = await lib.loadSheets();
    const codes = sheets.map((s) => s.sheetCode);
    assert.ok(codes.includes("G3-MATH-TEST-A"), "catalog has the G3 seed sheet");
    assert.ok(codes.includes("G4-MATH-2026-10"), "catalog has the Grade 4 sheet");
    for (const s of sheets) {
      assert.equal(typeof s.grade, "number");
      assert.equal(typeof s.subject, "string");
      assert.equal(typeof s.week, "string");
      assert.ok(s.questions.length > 0, `${s.sheetCode} has questions`);
      for (const q of s.questions) {
        assert.equal(typeof q.questionNumber, "number");
        assert.equal(typeof q.prompt, "string");
        assert.equal(typeof q.correctAnswer, "string");
        assert.ok(
          q.topic && q.topic.length > 0,
          `${s.sheetCode} Q${q.questionNumber} has a topic`
        );
      }
    }
  });

  it("resolves sheet codes case-insensitively", async () => {
    const sheet = await lib.getSheet("  g3-math-test-a ");
    assert.ok(sheet, "lowercase code with whitespace resolves");
    assert.equal(sheet.sheetCode, "G3-MATH-TEST-A");
    assert.equal(sheet.questions.length, 10);
  });

  it("returns null for unknown codes", async () => {
    assert.equal(await lib.getSheet("NOPE-404"), null);
    assert.equal(await lib.getSheet(""), null);
  });
});
