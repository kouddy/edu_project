"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadForm({ sheetIds }: { sheetIds: string[] }) {
  const router = useRouter();
  const [sheetId, setSheetId] = useState(sheetIds[0] ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !sheetId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("sheetId", sheetId);
      form.append("photo", file);
      const res = await fetch("/api/attempts", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      router.push(`/attempts/${data.attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <h2>Upload a finished sheet</h2>
      <label htmlFor="sheet">Worksheet</label>
      <select
        id="sheet"
        value={sheetId}
        onChange={(e) => setSheetId(e.target.value)}
      >
        {sheetIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <label htmlFor="photo">Photo (JPG/PNG, max 10 MB)</label>
      <input
        id="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" disabled={!file || !sheetId || busy}>
        {busy ? "Grading…" : "Upload and grade"}
      </button>
    </form>
  );
}
