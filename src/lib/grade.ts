import type { AttemptItem, Sheet } from "./types";

export interface GradeResult {
  rejectionReason: string | null;
  items: AttemptItem[];
}

const UNSURE_EXPLANATION =
  "I couldn't read this answer confidently, so I'm leaving it for a parent to check.";

function demoUnsureGrade(sheet: Sheet): GradeResult {
  return {
    rejectionReason: null,
    items: sheet.answerKey.map((q) => ({
      qid: q.qid,
      status: "unsure" as const,
      confidence: 0,
      modelReading: null,
      explanation:
        "Demo mode: no vision model key configured. " + UNSURE_EXPLANATION,
    })),
  };
}

function visionPrompt(sheet: Sheet): string {
  const key = sheet.answerKey
    .map((q) => `- ${q.qid}: prompt "${q.prompt}" | expected "${q.answer}"`)
    .join("\n");
  return [
    "You grade a photo of a printed elementary math worksheet.",
    "Compare each visible handwritten answer in its answer box to the answer key.",
    "Rules:",
    "1. Never guess. If handwriting is unreadable or confidence is low, status must be 'unsure'.",
    "2. If the image is not a worksheet, or is too blurry/cropped to grade, set rejectionReason with a plain-language retake request and leave items empty.",
    "3. For 'wrong' items include a short kid-friendly explanation (1-2 sentences).",
    "Return strict JSON: { rejectionReason: string|null, items: [{ qid, status, confidence, modelReading, explanation }] }.",
    `Answer key:\n${key}`,
  ].join("\n");
}

/** Accept either the API base URL or the full chat-completions endpoint. */
export function resolveChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

async function callVisionModel(
  sheet: Sheet,
  imageBase64: string,
  mimeType: string
): Promise<GradeResult> {
  const configuredUrl = process.env.MUSE_SPARK_API_URL;
  const apiKey = process.env.MUSE_SPARK_API_KEY;
  const model = process.env.MUSE_SPARK_MODEL ?? "muse-spark-1.3";

  // Pure single model API call (no agent harness): one request, structured JSON back.
  if (!configuredUrl || !apiKey) return demoUnsureGrade(sheet);
  const apiUrl = resolveChatCompletionsUrl(configuredUrl);

  // Meta Model API exposes an OpenAI-compatible chat-completions endpoint:
  // POST {base}/chat/completions with { model, messages, response_format }.
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: visionPrompt(sheet) },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    throw new Error(
      `Vision model request failed: ${res.status} ${res.statusText} — ${body}`
    );
  }
  const raw = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string;
      message?: {
        content?: string | Array<{ type?: string; text?: string }> | null;
        reasoning_content?: string;
      };
    }>;
  };
  const content = extractContent(raw);
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFences(content));
  } catch {
    throw new Error(
      `Vision model returned non-JSON content: ${content.slice(0, 200)}`
    );
  }
  return parseModelPayload(data, sheet);
}

/** Pull the assistant text out of a chat-completions response. */
export function extractContent(raw: {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
      reasoning_content?: string;
    };
  }>;
}): string {
  const choice = raw.choices?.[0];
  const message = choice?.message;
  const content = message?.content;
  if (typeof content === "string" && content.length > 0) return content;
  if (Array.isArray(content)) {
    const text = content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("");
    if (text.length > 0) return text;
  }
  throw new Error(
    "Vision model returned no message content " +
      `(finish_reason=${choice?.finish_reason ?? "unknown"}, ` +
      `has_reasoning=${typeof message?.reasoning_content === "string"}, ` +
      `raw=${JSON.stringify(raw).slice(0, 500)})`
  );
}

function stripCodeFences(content: string): string {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : content;
}

/** Validate the model's JSON payload and enforce the never-guess rule. */
export function parseModelPayload(data: unknown, sheet: Sheet): GradeResult {
  const payload =
    typeof data === "object" && data !== null
      ? (data as { rejectionReason?: unknown; items?: unknown })
      : null;
  if (!payload) throw new Error("Bad model response shape");
  if (typeof payload.rejectionReason === "string" && payload.rejectionReason) {
    return { rejectionReason: payload.rejectionReason, items: [] };
  }
  if (!Array.isArray(payload.items)) throw new Error("Bad model response shape");
  const items = payload.items as AttemptItem[];
  // Enforce the never-guess rule server-side: low confidence becomes unsure.
  return {
    rejectionReason: null,
    items: sheet.answerKey.map((q) => {
      const found = items.find((i) => i.qid === q.qid);
      if (!found) {
        return {
          qid: q.qid,
          status: "unsure" as const,
          confidence: 0,
          modelReading: null,
          explanation: UNSURE_EXPLANATION,
        };
      }
      const status =
        found.confidence < 0.6 ? ("unsure" as const) : found.status;
      return {
        qid: q.qid,
        status,
        confidence: found.confidence ?? 0,
        modelReading: found.modelReading ?? null,
        explanation:
          status === "unsure" && found.status !== "unsure"
            ? UNSURE_EXPLANATION
            : (found.explanation ?? ""),
      };
    }),
  };
}

export async function gradePhoto(
  sheet: Sheet,
  bytes: Buffer,
  mimeType: string
): Promise<GradeResult> {
  // Cheap pre-checks before spending a model call (~$0.005-0.025/photo).
  if (bytes.length < 8 * 1024) {
    return {
      rejectionReason:
        "This photo looks too small or incomplete to grade. Please retake it showing the full worksheet.",
      items: [],
    };
  }
  return callVisionModel(sheet, bytes.toString("base64"), mimeType);
}
