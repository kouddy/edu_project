import UploadForm from "./UploadForm";
import ProductLibrary from "./ProductLibrary";
import { loadAttempts, loadReviews, loadSheets } from "@/lib/store";
import { signPhotoUrl } from "@/lib/sign";

export default async function Home() {
  const [sheets, attempts, reviews] = await Promise.all([
    loadSheets(),
    loadAttempts(),
    loadReviews(),
  ]);
  const due = reviews.filter((r) => !r.done && r.dueAt <= new Date().toISOString());

  return (
    <div>
      <h1>Practice sheets, grades 1–6</h1>
      <p className="muted">
        Upload a photo of a finished worksheet. Unclear answers are marked
        unsure for you to check — never guessed.
      </p>

      <UploadForm sheetIds={sheets.map((s) => s.id)} />

      <ProductLibrary />

      <section className="card">
        <h2>Available sheets</h2>
        {sheets.length === 0 ? (
          <p className="muted">No sheets seeded yet.</p>
        ) : (
          <ul>
            {sheets.map((s) => (
              <li key={s.id}>
                {s.title} — {s.answerKey.length} questions
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>
          Review queue {due.length > 0 ? `(${due.length} due)` : "(nothing due)"}{" "}
          <a href="/review">Open</a>
        </h2>
      </section>

      <section className="card">
        <h2>Recent attempts</h2>
        {attempts.length === 0 ? (
          <p className="muted">No uploads yet.</p>
        ) : (
          <ul>
            {attempts.slice(0, 10).map((a) => (
              <li key={a.id}>
                <a href={`/attempts/${a.id}`}>
                  {a.sheetId} — {new Date(a.createdAt).toLocaleString()}
                </a>
                {a.rejectionReason ? " (needs retake)" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted">
        Demo photo URLs are signed and expire:{" "}
        {attempts[0] ? signPhotoUrl(attempts[0].photoFile).slice(0, 24) + "…" : "upload one to see"}
      </p>
    </div>
  );
}
