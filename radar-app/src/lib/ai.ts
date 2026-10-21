import Anthropic from "@anthropic-ai/sdk";
import type { Asset, Lang } from "../types";

const LANG_NAME: Record<Lang, string> = { ca: "català", es: "castellano", en: "English" };

function buildPrompt(a: Asset, extra: Record<string, unknown>, lang: Lang) {
  return `You are a rigorous financial analyst. Answer in ${LANG_NAME[lang]}, directly and concisely (max 220 words).
Rules: use ONLY the JSON data below; you have no internet access and no data after ${a.quoteTime ?? "the snapshot date"}. Always separate FACTS (from the data) from HYPOTHESES (your interpretation). If a figure is missing, say N/D. Do not give personalised buy or sell advice.
Format: short paragraphs or "- " bullet lists. You may use short "### " headings.`
    + `\n\nData for ${a.name} (${a.ticker}):\n${JSON.stringify({ ...a, ...extra })}`;
}

export interface AskOpts {
  key: string;
  model: string;
  lang: Lang;
  signal?: AbortSignal;
  onText: (t: string) => void;
}

/**
 * Streams an answer from the Claude API straight from the device (bring-your-own-key).
 * For a commercial release, route this through your own backend so the key never ships in the client.
 */
export async function askClaude(a: Asset, extra: Record<string, unknown>, question: string, o: AskOpts): Promise<{ text: string; truncated: boolean; refused: boolean }> {
  const client = new Anthropic({ apiKey: o.key, dangerouslyAllowBrowser: true });
  const stream = client.beta.messages.stream(
    {
      model: o.model,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      // routes a safety-classifier refusal to a fallback model instead of failing the answer
      fallbacks: "default",
      output_config: { effort: "low" },
      system: buildPrompt(a, extra, o.lang),
      messages: [{ role: "user", content: question }],
    } as unknown as Parameters<typeof client.beta.messages.stream>[0],
    { signal: o.signal }
  );
  let text = "";
  stream.on("text", (d) => { text += d; o.onText(text); });
  const msg = await stream.finalMessage();
  return { text, truncated: msg.stop_reason === "max_tokens", refused: msg.stop_reason === "refusal" };
}

export function aiErrorCode(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "auth";
  if (e instanceof Anthropic.RateLimitError) return "rate";
  if (e instanceof Anthropic.APIUserAbortError) return "cancelled";
  if (e instanceof Anthropic.APIConnectionError) return "network";
  if (e instanceof Anthropic.APIError) return "api";
  return "unknown";
}
