# Book data

Frozen weekly assignments for the printed books, one folder per
region and subject:

```
book-data/
  on/                 region (lowercase curriculum code)
    math/             subject (lowercase)
      weekly-questions-g2.json    one frozen file per grade
      weekly-questions-g3.json
      questions-g2.json           the pools file a v3 frozen file refs
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
- Topic titles come from the pools files — each topic record in
  `questions-g{grade}.json` carries its `title` — so there is no
  separate topic map to keep in sync.
- A frozen file is v3: sheets hold refs into the sibling
  `questions-g{grade}.json` pools file, and the document pins that
  file's sha256. The file and its pools file are a matched pair:
  sync both, or the loader refuses the file on a pin mismatch.
- Sheet identity is the printed code (`ON-MATH-G4-W12-S01`):
  region, subject, grade, week, sheet — the folders mirror it.
