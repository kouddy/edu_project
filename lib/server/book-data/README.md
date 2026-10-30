# Book data

Frozen weekly assignments for the printed books, one folder per
region and subject:

```
book-data/
  on/                 region (lowercase curriculum code)
    math/             subject (lowercase)
      topics.json                 grade → topic number → title
      weekly-questions-g2.json    one frozen file per grade
      weekly-questions-g3.json
      …
```

Rules:

- A weekly-questions file declares its own `curriculum`, `subject`
  and `grade` inside the JSON. The loader
  (`lib/server/book-catalogue.ts`) discovers region/subject folders
  at startup and loads every `weekly-questions-g*.json` it finds —
  adding a region or subject is adding a folder, no code change.
- If a file's declared curriculum/subject disagrees with its folder,
  the loader logs a warning and trusts the file. Keep them in sync.
- `topics.json` is per region+subject; a subject without one falls
  back to "Topic N" titles.
- Sheet identity is the printed code (`ON-MATH-G4-W12-S01`):
  region, subject, grade, week, sheet — the folders mirror it.
