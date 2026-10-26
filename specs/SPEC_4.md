Build the grading pipeline. Implement grading as a Next.js API route (/api/grade) so the vision API key stays server-side even in the local phase. The route receives the photo + sheet code, reads the answer key via the data layer, and:
1. Sends the photo and answer key to the vision model with the grading prompt below.
2. Parses the JSON response, saves it as a GradedResult through the data layer, computes the score counting only confident verdicts, and sets the submission status to "graded" or "rejected".

Grading prompt to use (adapt as needed, keep the rules):
"You are grading a child's worksheet photo. The answer key is provided. For each question return JSON only, no prose: an array of {question_number, answer_read (what the child wrote, or null), verdict: correct | incorrect | unsure, confidence 0-1, explanation (only for incorrect: one short, kind, kid-friendly sentence explaining the mistake)}. Rules: if you are not at least 80% sure what the child wrote, verdict must be unsure - never guess. Crossed-out or overwritten answers are unsure unless one answer is clearly final. If no worksheet is visible, or the photo is too blurry/cropped to grade, return {photo_rejected: true, reason: '...'} in plain language a parent would understand."

Handle API errors with one retry, then mark the submission "failed" with a parent-visible message. Show me it working on a real photo.
