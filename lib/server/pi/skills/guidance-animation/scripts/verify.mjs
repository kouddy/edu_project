#!/usr/bin/env node
/**
 * Standalone runner for the guidance-animation skill's verifier —
 * the same gate the server applies before a generated lesson is
 * kept, usable on any draft outside a session.
 *
 * Usage: node verify.mjs <artefact.html> <correct-answer>
 * Prints the verdict as JSON ({"ok":true} or {"ok":false,"detail":…})
 * and exits 0 when the artefact passes, 1 when it does not.
 * Needs Node >= 22.18: it imports the TypeScript module beside it
 * through Node's type stripping.
 */
import { readFileSync } from "node:fs";
import { verifyAnimation } from "./guidance-verify.ts";

const [file, answer] = process.argv.slice(2);
if (!file || answer === undefined) {
  console.error("usage: node verify.mjs <artefact.html> <correct-answer>");
  process.exit(2);
}
const verdict = await verifyAnimation(readFileSync(file, "utf8"), answer);
console.log(JSON.stringify(verdict));
process.exit(verdict.ok ? 0 : 1);
