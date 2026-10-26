You are helping me build an MVP. Then reply with a short architecture proposal and the list of build steps you recommend. Do not write feature code yet.

Product: a practice-sheet service for parents of kids in grades 1-6.
- Parents receive printed worksheets, with clear answer boxes for the child to write in. See file: grade_4_math_oct_2026.pdf
- After the child finishes a sheet, the parent photographs it and uploads the photo to this service.
- An AI vision model (or LLM Model with vision capability, so AI harness might be needed. Determine is pure LLM api call or AI harness is used) grades the photo against the sheet's stored answer key and returns per-question results with kid-friendly explanations for wrong answers.
- Questions the child got wrong go into a spaced-review queue (review after 1 day, 1 week, 1 month).

Hard rules:
- The AI must never guess. If it cannot read an answer confidently, it marks that question "unsure" for the parent to check, instead of grading it.
- If the photo does not show a worksheet, or is too blurry or cropped to grade, the AI rejects it with a plain-language reason and asks for a retake.
- Children's photos are private: private storage only, signed URLs, never public links. For now we store it locally.
- Keep scope MVP: no payments, no delivery/logistics features yet.

Stack: Next.js (App Router) + TypeScript + local storage for now + a vision-capable model API (Meta Muse Spark 1.3). Vision grading costs roughly $0.005-0.025 per photo, which is fine.
