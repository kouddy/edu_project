"use client";

import { useEffect, useState } from "react";
import type { ReviewItem } from "@/lib/types";

export default function ReviewPage() {
  const [due, setDue] = useState<ReviewItem[]>([]);
  const [upcoming, setUpcoming] = useState<ReviewItem[]>([]);

  async function load() {
    const res = await fetch("/api/review-queue");
    const data = await res.json();
    setDue(data.due ?? []);
    setUpcoming(data.upcoming ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function markDone(id: string) {
    await fetch(`/api/reviews/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    load();
  }

  return (
    <div>
      <p>
        <a href="/">← Home</a>
      </p>
      <h1>Spaced review</h1>
      <p className="muted">Wrong answers return after 1 day, 1 week, and 1 month.</p>
      <h2>Due now ({due.length})</h2>
      {due.length === 0 ? (
        <p className="muted">Nothing due. Nice work.</p>
      ) : (
        due.map((r) => (
          <div key={r.id} className="card">
            <p>
              <strong>{r.sheetId}</strong> — {r.qid} (from{" "}
              <a href={`/attempts/${r.attemptId}`}>attempt</a>)
            </p>
            <p className="muted">Due {new Date(r.dueAt).toLocaleDateString()}</p>
            <button onClick={() => markDone(r.id)}>Mark done</button>
          </div>
        ))
      )}
      <h2>Upcoming ({upcoming.length})</h2>
      <ul>
        {upcoming.map((r) => (
          <li key={r.id}>
            {r.sheetId} — {r.qid} — due {new Date(r.dueAt).toLocaleDateString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
