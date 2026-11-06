import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AiRequestError,
  buildScoringMessages,
  buildTranscriptDigest,
  isAiConfigured,
  parseScoreResponse,
  requestAiScore,
  testAiConnection,
  type ScoringInput,
} from "@/lib/ai-scoring";
import type { TranscriptSegment } from "@/lib/rehearsal-types";
import type { AiConfig } from "@/store/ai-config";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CFG: AiConfig = {
  baseUrl: "https://ai.example.com/v1",
  apiKey: "sk-test",
  model: "test-model",
};

const INPUT: ScoringInput = {
  settings: { totalMinutes: 20, firstReminderPct: 50, secondReminderPct: 75 },
  completedNaturally: true,
  totalElapsedMs: 1_200_000,
  metrics: null,
  lang: null,
  transcript: "[00:05] 测试转写",
};

const VALID_SCORE = JSON.stringify({
  total: 85,
  dimensions: [
    { key: "pace", score: 80, comment: "语速平稳" },
    { key: "fillers", score: 90, comment: "填充词少" },
    { key: "structure", score: 85, comment: "结构清晰" },
    { key: "timing", score: 95, comment: "时间刚好" },
    { key: "content", score: 75, comment: "内容可再打磨" },
  ],
  suggestions: ["开头可引用「测试转写」展开"],
  summary: "整体不错",
});

function completionBody(content: string) {
  return { choices: [{ message: { content } }] };
}

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("isAiConfigured", () => {
  it("三项齐全才可用", () => {
    expect(isAiConfigured(CFG)).toBe(true);
    expect(isAiConfigured({ ...CFG, apiKey: "" })).toBe(false);
    expect(isAiConfigured({ ...CFG, baseUrl: "   " })).toBe(false);
    expect(isAiConfigured({ ...CFG, model: "" })).toBe(false);
  });
});

describe("buildTranscriptDigest", () => {
  const segments: TranscriptSegment[] = [
    { text: "A".repeat(100), startMs: 0, endMs: 1_000, isFinal: true },
    { text: "B".repeat(100), startMs: 1_000, endMs: 2_000, isFinal: true },
    { text: "C".repeat(100), startMs: 2_000, endMs: 3_000, isFinal: true },
    { text: "半成品", startMs: 3_000, endMs: 3_500, isFinal: false },
    { text: "  ", startMs: 3_500, endMs: 4_000, isFinal: true },
  ];

  it("带时间戳、过滤非 final 与空段", () => {
    const digest = buildTranscriptDigest(segments);
    expect(digest.split("\n")).toHaveLength(3);
    expect(digest.startsWith("[00:00] AAA")).toBe(true);
    expect(digest).toContain("[00:01]");
    expect(digest).not.toContain("半成品");
  });

  it("超长截中段，保留头尾", () => {
    const digest = buildTranscriptDigest(segments, 100);
    expect(digest).toContain("…（中间部分省略）…");
    expect(digest.startsWith("[00:00] AAA")).toBe(true);
    expect(digest.endsWith("CCC")).toBe(true);
    expect(digest).not.toContain("B".repeat(100));
  });
});

describe("buildScoringMessages", () => {
  it("system 要求严格 JSON，user 含设置/指标/转写", () => {
    const messages = buildScoringMessages(INPUT);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("JSON");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("计划时长：20 分钟");
    expect(messages[1].content).toContain("【客观指标】");
    expect(messages[1].content).toContain("[00:05] 测试转写");
  });

  it("无指标时给出说明", () => {
    const messages = buildScoringMessages(INPUT);
    expect(messages[1].content).toContain("无转写数据");
  });
});

describe("parseScoreResponse", () => {
  it("标准 JSON", () => {
    const score = parseScoreResponse(VALID_SCORE, "m1", 123);
    expect(score.total).toBe(85);
    expect(score.dimensions).toHaveLength(5);
    expect(score.dimensions[0]).toEqual({
      key: "pace",
      score: 80,
      comment: "语速平稳",
    });
    expect(score.suggestions).toEqual(["开头可引用「测试转写」展开"]);
    expect(score.summary).toBe("整体不错");
    expect(score.model).toBe("m1");
    expect(score.scoredAt).toBe(123);
  });

  it("剥离 ```json 代码围栏", () => {
    const wrapped = "```json\n" + VALID_SCORE + "\n```";
    expect(parseScoreResponse(wrapped, "m1").total).toBe(85);
    const wrapped2 = "```\n" + VALID_SCORE + "\n```";
    expect(parseScoreResponse(wrapped2, "m1").total).toBe(85);
  });

  it("杂文包裹时截取首尾花括号", () => {
    const noisy = `好的，评分如下：${VALID_SCORE} 希望对你有帮助！`;
    expect(parseScoreResponse(noisy, "m1").total).toBe(85);
  });

  it("字符串数字宽容", () => {
    const raw = JSON.stringify({
      total: "88",
      dimensions: [
        { key: "pace", score: "80", comment: "a" },
        { key: "fillers", score: "70", comment: "b" },
        { key: "timing", score: "60", comment: "c" },
      ],
      suggestions: [],
      summary: "ok",
    });
    const score = parseScoreResponse(raw, "m1");
    expect(score.total).toBe(88);
    expect(score.dimensions[0].score).toBe(80);
  });

  it("分数 clamp 到 0-100", () => {
    const raw = JSON.stringify({
      total: 150,
      dimensions: [
        { key: "pace", score: -20, comment: "a" },
        { key: "fillers", score: 200, comment: "b" },
        { key: "timing", score: 60, comment: "c" },
      ],
      suggestions: [],
      summary: "",
    });
    const score = parseScoreResponse(raw, "m1");
    expect(score.total).toBe(100);
    expect(score.dimensions[0].score).toBe(0);
    expect(score.dimensions[1].score).toBe(100);
  });

  it("非法维度跳过、重复维度去重", () => {
    const raw = JSON.stringify({
      total: 70,
      dimensions: [
        { key: "unknown", score: 10, comment: "x" },
        { key: "pace", score: 80, comment: "a" },
        { key: "pace", score: 20, comment: "dup" },
        { key: "fillers", score: 70, comment: "b" },
        { key: "timing", score: 60, comment: "c" },
      ],
      suggestions: [],
      summary: "",
    });
    const score = parseScoreResponse(raw, "m1");
    expect(score.dimensions.map((d) => d.key)).toEqual([
      "pace",
      "fillers",
      "timing",
    ]);
    expect(score.dimensions[0].score).toBe(80);
  });

  it("有效维度不足 3 个判 parse 错误", () => {
    const raw = JSON.stringify({
      total: 70,
      dimensions: [{ key: "pace", score: 80, comment: "a" }],
      suggestions: [],
      summary: "",
    });
    expect(() => parseScoreResponse(raw, "m1")).toThrow(AiRequestError);
    try {
      parseScoreResponse(raw, "m1");
    } catch (e) {
      expect((e as AiRequestError).kind).toBe("parse");
    }
  });

  it("非 JSON / 缺 total 判 parse 错误", () => {
    expect(() => parseScoreResponse("我不知道该怎么评分", "m1")).toThrow(
      AiRequestError,
    );
    expect(() => parseScoreResponse("{ 截断了", "m1")).toThrow(AiRequestError);
    expect(() =>
      parseScoreResponse(JSON.stringify({ dimensions: [] }), "m1"),
    ).toThrow(AiRequestError);
  });

  it("suggestions 过滤空串并截 5 条", () => {
    const raw = JSON.stringify({
      total: 70,
      dimensions: [
        { key: "pace", score: 80, comment: "a" },
        { key: "fillers", score: 70, comment: "b" },
        { key: "timing", score: 60, comment: "c" },
      ],
      suggestions: ["", "  ", "s1", "s2", "s3", "s4", "s5", "s6"],
      summary: "",
    });
    const score = parseScoreResponse(raw, "m1");
    expect(score.suggestions).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });
});

describe("requestAiScore", () => {
  it("成功返回评分并按 OpenAI 兼容格式请求", async () => {
    const fetchMock = stubFetch(completionBody(VALID_SCORE));
    const score = await requestAiScore(CFG, INPUT);
    expect(score.total).toBe(85);
    expect(score.model).toBe("test-model");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://ai.example.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("test-model");
    expect(body.temperature).toBe(0.3);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("未配置抛 config 错误且不发请求", async () => {
    const fetchMock = stubFetch(completionBody(VALID_SCORE));
    await expect(
      requestAiScore({ ...CFG, apiKey: "" }, INPUT),
    ).rejects.toMatchObject({ kind: "config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("HTTP 401 抛 http 错误并提示检查 Key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid api key", { status: 401 })),
    );
    await expect(requestAiScore(CFG, INPUT)).rejects.toMatchObject({
      kind: "http",
      status: 401,
    });
    await expect(requestAiScore(CFG, INPUT)).rejects.toThrow(/API Key/);
  });

  it("HTTP 429 提示限流", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("slow down", { status: 429 })),
    );
    await expect(requestAiScore(CFG, INPUT)).rejects.toThrow(/限流/);
  });

  it("网络异常抛 network 错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(requestAiScore(CFG, INPUT)).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("响应缺少 content 抛 parse 错误", async () => {
    stubFetch({ choices: [] });
    await expect(requestAiScore(CFG, INPUT)).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it("外部 abort 时原样抛出 AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError");
      }),
    );
    const signal = AbortSignal.abort();
    await expect(requestAiScore(CFG, INPUT, signal)).rejects.toBeInstanceOf(
      DOMException,
    );
  });
});

describe("testAiConnection", () => {
  it("成功返回 null", async () => {
    stubFetch(completionBody("OK"));
    await expect(testAiConnection(CFG)).resolves.toBeNull();
  });

  it("未配置返回提示", async () => {
    const message = await testAiConnection({ ...CFG, apiKey: "" });
    expect(message).toContain("设置页");
  });

  it("限流返回可读原因", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("slow down", { status: 429 })),
    );
    const message = await testAiConnection(CFG);
    expect(message).toContain("限流");
  });
});
