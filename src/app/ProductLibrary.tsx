"use client";

import { useEffect, useState } from "react";
import { newId, store } from "@/lib/browser-store";
import type { Child, Sheet } from "@/lib/product-types";

export default function ProductLibrary() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("3");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await store.seedIfEmpty();
        const [c, s] = await Promise.all([store.listChildren(), store.listSheets()]);
        if (live) {
          setChildren(c);
          setSheets(s);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Failed to load library.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const gradeNum = Number(grade);
    if (!trimmed || !Number.isFinite(gradeNum)) return;
    setError(null);
    try {
      await store.saveChild({ id: newId("child"), name: trimmed, grade: gradeNum });
      setChildren(await store.listChildren());
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save child.");
    }
  }

  if (children === null || sheets === null) {
    return (
      <section className="card" aria-live="polite">
        <h2>Library</h2>
        <p className="muted">Loading children and sheets…</p>
      </section>
    );
  }

  const sample = sheets.find((s) => s.sheetCode === "G3-MATH-TEST-A") ?? sheets[0];

  return (
    <section className="card">
      <h2>Library (new data layer)</h2>
      <p className="muted">
        Read through the store interface — this component never touches localStorage or
        IndexedDB directly.
      </p>
      {error ? <p className="error">{error}</p> : null}

      <h3>Children</h3>
      {children.length === 0 ? (
        <p className="muted">No children yet — add one below.</p>
      ) : (
        <ul>
          {children.map((c) => (
            <li key={c.id}>
              {c.name} — grade {c.grade}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addChild}>
        <label htmlFor="child-name">Name</label>
        <input
          id="child-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Maya"
        />
        <label htmlFor="child-grade">Grade</label>
        <select id="child-grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!name.trim()}>
          Add child
        </button>
      </form>

      <h3>Sheets</h3>
      {sheets.length === 0 ? (
        <p className="muted">No sheets seeded yet.</p>
      ) : (
        <ul>
          {sheets.map((s) => (
            <li key={s.sheetCode}>
              {s.sheetCode} — grade {s.grade} {s.subject} ({s.week}), {s.questions.length}{" "}
              questions
            </li>
          ))}
        </ul>
      )}

      {sample ? (
        <>
          <h3>
            Seeded sheet: {sample.sheetCode} (grade {sample.grade} {sample.subject},{" "}
            {sample.week})
          </h3>
          <ol>
            {sample.questions.map((q) => (
              <li key={q.questionNumber}>
                <strong>Q{q.questionNumber}.</strong> {q.prompt} — answer: {q.correctAnswer}{" "}
                <span className="muted">[{q.topic}]</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
