# edu_project

The goal of this project:

1. On weekly or monthly basis, course work for their kids will be delivered to them by human.
2. The kids will complete their course work and parents will take pictures of it and upload it to the system.
3. The system will grade the work using AI and provide feedback to the kids.

## How it works (single pipeline)

- **Upload:** [upload/page.tsx](src/app/upload/page.tsx) — pick a child and sheet code, add a worksheet photo. The photo goes to IndexedDB and a `Submission` record to localStorage, both through the `Store` interface in [browser-store.ts](src/lib/browser-store.ts).
- **Grade:** [grade-client.ts](src/lib/grade-client.ts) posts the photo + sheet code to [api/grade](src/app/api/grade/route.ts), which reads the answer key from the server catalog and calls the vision model. The outcome is saved as a `GradedResult`; missed topics go into the spaced-review queue.
- **Review:** [review/page.tsx](src/app/review/page.tsx) — missed topics come back after 1 day, 1 week, and 1 month.
- **Dashboard:** [dashboard/page.tsx](src/app/dashboard/page.tsx) — children, uploads, and results.

## Single sources of truth

- **Sheets/answer keys:** the server owns them ([data/sheets.json](data/sheets.json), read via [store.ts](src/lib/store.ts)). Browsers sync read-only copies from `GET /api/sheets`, so every visible sheet is gradable.
- **Grading core:** one prompt, one parser, one never-guess rule (verdicts below 0.8 confidence become `unsure`) in [product-grade.ts](src/lib/product-grade.ts), over the shared vision transport in [vision-client.ts](src/lib/vision-client.ts).
- **Types:** [product-types.ts](src/lib/product-types.ts). Children, submissions, results, and reviews live in the browser store for the local phase; swapping `BrowserStore` for a Supabase implementation later means touching only [browser-store.ts](src/lib/browser-store.ts).

## Checks

- `npm test` — grading contract, sheet catalog, and HeroUI RSC-boundary tests.
- `npm run typecheck` and `npm run build` must be green.
