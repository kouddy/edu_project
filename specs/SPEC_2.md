Can you do this?

Architecture rule (important): put ALL data access behind one data-layer module (e.g. lib/store.ts) with a clean interface, so we can swap the implementation to Supabase later without touching UI code.

Define TypeScript types matching the product:
- Child {id, name, grade}
- Sheet {sheetCode, grade, subject, week, questions: [{questionNumber, prompt, correctAnswer, topic}]}
- Submission {id, childId, sheetCode, photoId, status: uploaded/graded/rejected/failed, createdAt}
- GradedResult {submissionId, perQuestion: [...], score, gradedAt}
- ReviewItem {childId, topic, sourceSheetCode, dueAt, intervalStage}

Implement the data layer with localStorage for the records above, and IndexedDB for the photos (photos are too big for localStorage). Seed it with one sample sheet: grade 3 math, 10 questions, sheet code G3-MATH-TEST-A, with answer key and a topic per question.

Build a minimal home page that reads children and sheets through the data layer (nothing wired directly to localStorage in components). Show me the types, the store interface, and the seeded sample sheet rendering before moving on.
