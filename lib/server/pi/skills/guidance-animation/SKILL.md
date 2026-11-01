---
name: guidance-animation
description: Build one animated HTML lesson for a practice-sheet question a child got wrong — the artefact contract, the draft → preview → submit workflow, and the deterministic verification (scripts/verify.mjs) every lesson must pass.
---

You make a tiny animated lesson that shows a child how to solve one math question they got wrong. You work only through your tools: render_preview shows you exactly what your draft does when a child steps through it, and submit_animation hands in the finished lesson. Text replies do not reach the child — only a submitted animation does.

The contract every animation must satisfy:

- One complete, self-contained HTML document: inline <style> and <script>, no external URLs, nothing loaded from anywhere else.
- Teach by showing the working with the question's own numbers. Very few words; big, clear numbers.
- No title or heading inside the animation. The page showing the lesson already puts the question at the top, so a title only repeats it — start straight into the working.
- The animation advances in small steps. A button with the attribute data-step advances exactly one step per click and becomes disabled at the final step. A button with the attribute data-play plays the steps automatically at a pace a child can follow — about 1.2 seconds per step, never less than 1 second.
- Play works every time it is pressed. When the lesson has finished, pressing Play starts it over from the beginning: every running total, highlight, and the final answer reset first, then the steps play through again. A Play button that does nothing once the lesson is done is a defect.
- An element with id "guidance-final" stays empty until the final step, when its text becomes exactly the correct answer you were given.
- Every number shown must agree with the working. Running totals only ever show values the steps actually produced, and stepping past the end must be impossible.
- The animation is used on a phone, in a frame 340px wide and 380px tall — design for that narrow screen, not for a desktop page shrunk down. Lay out with width:100% inside that box, no scrolling in either direction. Every row must fit the 340px: build rows from flexible widths that can shrink and wrap, never fixed-width boxes side by side whose widths add up past the frame — on the phone the excess is simply cut off at the edge. Page style: background #fff8ec, text #3d2b1f, accent #e8710a, rounded friendly shapes, system fonts.
- The frame is the panel: lay the lesson out directly on the page background — no outer card, border, or container wrapping the whole lesson. Boxes belong to the steps themselves (a number being built, a total), not to the page.
- For SVG shapes, animate with transform ATTRIBUTES (for example transform="rotate(270 170 105)") with the centre written out. Never use CSS transforms on SVG elements — they pivot around the wrong point in browsers and hands end up detached from the clock. Keep every shape inside the viewBox at every step.

How to work:

1. Draft the full HTML for the question.
2. Call render_preview with it. Read the report carefully: the per-step text trace is what the child sees at each step, the final text is where the lesson lands, and any lint, script errors, or shapes outside the picture are defects to fix — especially a shape whose position looks wrong, because the child sees positions, not code.
3. Fix and preview again until the trace is right at every step, not only at the end.
4. Call submit_animation. It runs the same checks as a hard gate: if it rejects the animation it tells you why — fix exactly that and submit again. When it accepts, stop.

The checks behind render_preview and submit_animation live in this skill as scripts/guidance-verify.ts, with scripts/verify.mjs as its standalone runner (`node scripts/verify.mjs <artefact.html> <correct-answer>` prints the verdict as JSON). In a session the tools run them for you; the runner exists so the same gate can be applied to a draft anywhere, and the server re-runs it before any submitted lesson is kept — a lesson no verifier has passed never reaches a child.
