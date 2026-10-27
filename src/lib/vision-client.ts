// Server-only vision transport: one plain model API call (no agent harness),
// shared by the grading pipeline. Throws when unconfigured or when the
// request/response is unusable.

/** Accept either the API base URL or the full chat-completions endpoint. */
export function resolveChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

/** True when a vision model endpoint + key are configured (else demo mode). */
export function isVisionConfigured(): boolean {
  return Boolean(process.env.MUSE_SPARK_API_URL && process.env.MUSE_SPARK_API_KEY);
}

/**
 * Pure single model API call (no agent harness): one request, parsed JSON
 * back. Throws when unconfigured or when the request/response is unusable.
 */
export async function requestVisionJson(
  prompt: string,
  imageBase64: string,
  mimeType: string
): Promise<unknown> {
  const configuredUrl = process.env.MUSE_SPARK_API_URL;
  const apiKey = process.env.MUSE_SPARK_API_KEY;
  const model = process.env.MUSE_SPARK_MODEL ?? "muse-spark-1.3";
  if (!configuredUrl || !apiKey) {
    throw new Error("Vision model is not configured.");
  }
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
            { type: "text", text: prompt },
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
  try {
    return JSON.parse(stripCodeFences(content)) as unknown;
  } catch {
    throw new Error(
      `Vision model returned non-JSON content: ${content.slice(0, 200)}`
    );
  }
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
