import type {
  AiDimensionKey,
  AiScore,
  AiScoreDimension,
  SpeechLang,
  SpeechMetrics,
  TranscriptSegment,
} from "@/lib/rehearsal-types";
import type { AiConfig } from "@/store/ai-config";
import {
  formatOffset,
  reminderPoints,
  totalDurationMs,
  type TimerSettings,
} from "@/lib/timer-core";

export type AiRequestErrorKind = "config" | "network" | "http" | "parse";

const REQUEST_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 15_000;
const MAX_TRANSCRIPT_CHARS = 12_000;

export const AI_ERROR_MESSAGE: Record<AiRequestErrorKind, string> = {
  config: "AI 配置不完整，请在设置页填写接口地址、API Key 与模型",
  network:
    "无法连接 AI 服务，请检查网络与接口地址；若为浏览器访问，还需接口支持 CORS",
  http: "AI 服务返回错误",
  parse: "AI 返回格式异常，请重试",
};

export class AiRequestError extends Error {
  kind: AiRequestErrorKind;
  status: number | null;

  constructor(
    kind: AiRequestErrorKind,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "AiRequestError";
    this.kind = kind;
    this.status = status;
  }
}

/** 三项配置齐全才视为可用 */
export function isAiConfigured(config: AiConfig): boolean {
  return (
    config.baseUrl.trim() !== "" &&
    config.apiKey.trim() !== "" &&
    config.model.trim() !== ""
  );
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 带 [mm:ss] 时间戳的转写全文；超长时截中段，保留头尾 */
export function buildTranscriptDigest(
  segments: TranscriptSegment[],
  maxChars: number = MAX_TRANSCRIPT_CHARS,
): string {
  const lines = segments
    .filter((s) => s.isFinal && s.text.trim().length > 0)
    .map((s) => `[${formatOffset(s.startMs)}] ${s.text.trim()}`);
  const full = lines.join("\n");
  if (full.length <= maxChars) return full;
  const keep = Math.floor(maxChars / 2);
  return `${full.slice(0, keep)}\n…（中间部分省略）…\n${full.slice(full.length - keep)}`;
}

export interface ScoringInput {
  settings: TimerSettings;
  completedNaturally: boolean;
  totalElapsedMs: number;
  metrics: SpeechMetrics | null;
  lang: SpeechLang | null;
  /** buildTranscriptDigest 的产物 */
  transcript: string;
}

const SYSTEM_PROMPT = [
  "你是一位资深演讲教练。请根据演讲演练的客观指标与带时间戳的转写全文，对这次演练打分并给出改进建议。",
  "只输出一个 JSON 对象，不要输出任何其他文本、解释或代码围栏。JSON 结构如下：",
  '{"total": <0-100 整数，总分>, "dimensions": [{"key": "pace"|"fillers"|"structure"|"timing"|"content", "score": <0-100 整数>, "comment": "<不超过50字的点评>"}], "suggestions": ["<3-5条，每条不超过60字的具体建议>"], "summary": "<不超过100字的总体评价>"}',
  "dimensions 必须包含全部 5 个维度：pace（语速节奏）、fillers（填充词控制）、structure（结构推进）、timing（时间掌控）、content（内容质量）。",
  "建议必须引用转写中的实际内容，指出具体位置或原话，避免空泛。",
  "评分参考：中文语速 180-260 字/分、英文 110-160 词/分较佳；填充词越少越好；时间达成率 90%-110% 为佳；各提醒点的实际内容占比越接近理想占比，说明结构推进越均匀。",
].join("\n");

function formatMetricsForPrompt(metrics: SpeechMetrics | null): string {
  if (!metrics) return "（本次演练无转写数据，仅有时长信息，请据此酌情评分）";
  const lines: string[] = [
    `语言：${metrics.lang === "zh" ? "中文" : "英文"}`,
    `语速：${metrics.charsPerMin ?? metrics.wordsPerMin ?? "无法计算"} ${metrics.lang === "zh" ? "字/分钟" : "词/分钟"}`,
    `总量：${metrics.totalChars} 中文字符 / ${metrics.totalWords} 英文单词`,
    `填充词：${metrics.fillerCount} 次（${metrics.fillerPerMin} 次/分钟）`,
  ];
  const breakdown = Object.entries(metrics.fillerBreakdown)
    .map(([word, count]) => `${word}×${count}`)
    .join("、");
  if (breakdown) lines.push(`填充词明细：${breakdown}`);
  lines.push(
    `长停顿：${metrics.longPauses.length} 次，合计 ${formatOffset(metrics.totalPauseMs)}`,
    `有效说话时长：${formatOffset(metrics.spokenDurationMs)}`,
    `时间达成率：${Math.round(metrics.timeAchievementRatio * 100)}%（${metrics.timeStatus === "under" ? "提前结束" : metrics.timeStatus === "over" ? "超时" : "节奏合适"}）`,
  );
  for (const item of metrics.segmentProgress) {
    lines.push(
      `分段进度-${item.reminderId}（${formatOffset(item.atMs)}）：实际已说 ${Math.round(item.spokenRatio * 100)}% / 理想 ${Math.round(item.expectedRatio * 100)}%`,
    );
  }
  return lines.join("\n");
}

/** 组装 system + user 两条消息 */
export function buildScoringMessages(input: ScoringInput): ChatMessage[] {
  const points = reminderPoints(input.settings);
  const settingLines = [
    `计划时长：${input.settings.totalMinutes} 分钟`,
    `提醒点：第一次 ${formatOffset(points[0].atMs)}、第二次 ${formatOffset(points[1].atMs)}、结束 ${formatOffset(points[2].atMs)}`,
    `实际用时：${formatOffset(input.totalElapsedMs)}（总时长 ${formatOffset(totalDurationMs(input.settings))}）`,
    `是否自然讲到计时结束：${input.completedNaturally ? "是" : "否（提前结束）"}`,
  ].join("\n");

  const userContent = [
    "【演练设置】",
    settingLines,
    "",
    "【客观指标】",
    formatMetricsForPrompt(input.metrics),
    "",
    "【转写全文】",
    input.transcript || "（无转写内容）",
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

const DIMENSION_KEYS: AiDimensionKey[] = [
  "pace",
  "fillers",
  "structure",
  "timing",
  "content",
];

function toNumberOrNaN(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 容错解析评分 JSON：剥代码围栏、截取首尾花括号、字符串数字宽容、分数 clamp。
 * 有效维度不足 3 个视为格式异常。
 */
export function parseScoreResponse(
  raw: string,
  model: string,
  scoredAt: number = Date.now(),
): AiScore {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) text = fence[1].trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) {
    throw new AiRequestError("parse", AI_ERROR_MESSAGE.parse);
  }
  text = text.slice(first, last + 1);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AiRequestError("parse", AI_ERROR_MESSAGE.parse);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new AiRequestError("parse", AI_ERROR_MESSAGE.parse);
  }

  const obj = data as Record<string, unknown>;
  const total = toNumberOrNaN(obj.total);
  if (!Number.isFinite(total)) {
    throw new AiRequestError("parse", AI_ERROR_MESSAGE.parse);
  }

  const dimensions: AiScoreDimension[] = [];
  const rawDimensions = Array.isArray(obj.dimensions) ? obj.dimensions : [];
  for (const item of rawDimensions) {
    if (typeof item !== "object" || item === null) continue;
    const dim = item as Record<string, unknown>;
    const key = toText(dim.key) as AiDimensionKey;
    if (!DIMENSION_KEYS.includes(key)) continue;
    if (dimensions.some((d) => d.key === key)) continue;
    const score = toNumberOrNaN(dim.score);
    if (!Number.isFinite(score)) continue;
    dimensions.push({
      key,
      score: clampScore(score),
      comment: toText(dim.comment).slice(0, 100),
    });
  }
  if (dimensions.length < 3) {
    throw new AiRequestError("parse", AI_ERROR_MESSAGE.parse);
  }

  const suggestions = (Array.isArray(obj.suggestions) ? obj.suggestions : [])
    .map((s) => toText(s).trim())
    .filter((s) => s.length > 0)
    .slice(0, 5)
    .map((s) => s.slice(0, 200));

  return {
    total: clampScore(total),
    dimensions,
    suggestions,
    summary: toText(obj.summary).trim().slice(0, 300),
    model,
    scoredAt,
  };
}

function httpErrorMessage(status: number, body: string): string {
  const detail = body.trim().slice(0, 120);
  if (status === 401 || status === 403) {
    return `AI 服务拒绝请求（${status}）：请检查 API Key 是否正确${detail ? `。${detail}` : ""}`;
  }
  if (status === 429) {
    return "AI 服务限流（429）：请稍后重试";
  }
  return `AI 服务错误（${status}）${detail ? `：${detail}` : ""}`;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
}

/**
 * 用带超时的 controller 包装外部 signal。
 * 不用 AbortSignal.any/timeout（Hermes 兼容性差），手动联动。
 */
function linkAbort(
  controller: AbortController,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): () => void {
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);
  return () => {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  };
}

async function chatCompletion(
  cfg: AiConfig,
  body: Record<string, unknown>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const dispose = linkAbort(controller, timeoutMs, externalSignal);
  try {
    return await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    dispose();
  }
}

/** 请求 LLM 评分；失败抛 AiRequestError（外部主动 abort 时原样抛 AbortError） */
export async function requestAiScore(
  cfg: AiConfig,
  input: ScoringInput,
  externalSignal?: AbortSignal,
): Promise<AiScore> {
  if (!isAiConfigured(cfg)) {
    throw new AiRequestError("config", AI_ERROR_MESSAGE.config);
  }
  const messages = buildScoringMessages(input);

  let response: Response;
  try {
    response = await chatCompletion(
      cfg,
      {
        model: cfg.model,
        messages,
        temperature: 0.3,
        response_format: { type: "json_object" },
      },
      REQUEST_TIMEOUT_MS,
      externalSignal,
    );
  } catch (e) {
    if (externalSignal?.aborted) throw e;
    throw new AiRequestError("network", AI_ERROR_MESSAGE.network);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AiRequestError(
      "http",
      httpErrorMessage(response.status, body),
      response.status,
    );
  }

  const data = (await response
    .json()
    .catch(() => null)) as ChatCompletionResponse | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AiRequestError("parse", AI_ERROR_MESSAGE.parse);
  }
  return parseScoreResponse(content, cfg.model);
}

/** 设置页「测试连接」：成功返回 null，失败返回用户可读原因 */
export async function testAiConnection(
  cfg: AiConfig,
  externalSignal?: AbortSignal,
): Promise<string | null> {
  if (!isAiConfigured(cfg)) return AI_ERROR_MESSAGE.config;
  let response: Response;
  try {
    response = await chatCompletion(
      cfg,
      {
        model: cfg.model,
        messages: [{ role: "user", content: "回复 OK" }],
        max_tokens: 8,
      },
      TEST_TIMEOUT_MS,
      externalSignal,
    );
  } catch {
    if (externalSignal?.aborted) return null;
    return AI_ERROR_MESSAGE.network;
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return httpErrorMessage(response.status, body);
  }
  return null;
}
