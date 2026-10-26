import { getAttempt, getSheet } from "@/lib/store";
import { signPhotoUrl } from "@/lib/sign";
import { notFound } from "next/navigation";

export default async function AttemptPage({
  params,
}: {
  params: { id: string };
}) {
  const attempt = await getAttempt(params.id);
  if (!attempt) notFound();
  const sheet = await getSheet(attempt.sheetId);

  return (
    <div>
      <p>
        <a href="/">← All sheets</a>
      </p>
      <h1>Result — {attempt.sheetId}</h1>
      <p className="muted">{new Date(attempt.createdAt).toLocaleString()}</p>
      <img
        className="sheet-photo"
        src={signPhotoUrl(attempt.photoFile)}
        alt="Uploaded worksheet photo"
      />
      {attempt.rejectionReason ? (
        <div className="card">
          <h2>Needs a retake</h2>
          <p>{attempt.rejectionReason}</p>
          <p className="muted">
            Tip: flatten the sheet, include all four corners, and retake in good light.
          </p>
          <p>
            <a href="/">Upload again</a>
          </p>
        </div>
      ) : (
        <div>
          {attempt.items.map((item) => {
            const key = sheet?.answerKey.find((k) => k.qid === item.qid);
            return (
              <div key={item.qid} className="card">
                <p>
                  <strong>{item.qid}</strong>
                  {key ? ` — ${key.prompt}` : ""}{" "}
                  <span className={`badge ${item.status}`}>{item.status}</span>
                </p>
                {item.status === "unsure" ? (
                  <p className="muted">
                    Please check this one together — {item.explanation}
                  </p>
                ) : (
                  <p>{item.explanation}</p>
                )}
                {item.modelReading ? (
                  <p className="muted">Read as: {item.modelReading}</p>
                ) : null}
              </div>
            );
          })}
          <p>
            <a href="/review">Open review queue →</a>
          </p>
        </div>
      )}
    </div>
  );
}
