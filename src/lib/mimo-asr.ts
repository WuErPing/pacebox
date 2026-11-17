import {
  AI_ERROR_MESSAGE,
  AiRequestError,
  chatCompletion,
  httpErrorMessage,
} from "@/lib/ai-scoring";
import { bytesToBase64 } from "@/lib/wav";
import type { AiConfig } from "@/store/ai-config";

/** 同 diting：单片请求 90s 超时 */
export const ASR_TIMEOUT_MS = 90_000;

export function asrLanguage(lang: string): "zh" | "en" | "auto" {
  const lower = lang.toLowerCase();
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("en")) return "en";
  return "auto";
}

/**
 * MiMo ASR：整段 WAV 走 OpenAI 兼容 chat/completions 的 input_audio。
 * 静音片返回空文本属合法结果，返回 ""（是否整体回退由编排层判定）。
 */
export async function transcribeChunk(
  cfg: AiConfig,
  wavBytes: Uint8Array,
  lang: string,
  externalSignal?: AbortSignal,
): Promise<string> {
  if (!cfg.asrModel || !cfg.baseUrl.trim() || !cfg.apiKey.trim()) {
    throw new AiRequestError("config", AI_ERROR_MESSAGE.config);
  }
  const body = {
    model: cfg.asrModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: `data:audio/wav;base64,${bytesToBase64(wavBytes)}`,
            },
          },
        ],
      },
    ],
    stream: false,
    asr_options: { language: asrLanguage(lang) },
  };

  let response: Response;
  try {
    response = await chatCompletion(cfg, body, ASR_TIMEOUT_MS, externalSignal);
  } catch (e) {
    if (externalSignal?.aborted) throw e;
    throw new AiRequestError("network", AI_ERROR_MESSAGE.network);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new AiRequestError(
      "http",
      httpErrorMessage(response.status, text),
      response.status,
    );
  }

  const data = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AiRequestError("parse", AI_ERROR_MESSAGE.parse);
  }
  return content.trim();
}