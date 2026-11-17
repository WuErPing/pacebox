import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_AI_CONFIG,
  sanitizeAiConfig,
} from "@/store/ai-config";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

describe("sanitizeAiConfig", () => {
  it("旧数据无 asrModel 字段时补为空串（关闭精校）", () => {
    const legacy = {
      baseUrl: "https://ai.example.com/v1",
      apiKey: "sk-old",
      model: "old-model",
    };
    expect(sanitizeAiConfig(legacy).asrModel).toBe("");
  });

  it("asrModel 空串合法保留，不回退默认", () => {
    expect(sanitizeAiConfig({ asrModel: "" }).asrModel).toBe("");
    expect(sanitizeAiConfig({ asrModel: "  " }).asrModel).toBe("");
  });

  it("asrModel 非空时 trim 保留", () => {
    expect(sanitizeAiConfig({ asrModel: " mimo-v2.5-asr " }).asrModel).toBe(
      "mimo-v2.5-asr",
    );
  });

  it("model 空串仍回退默认", () => {
    expect(sanitizeAiConfig({ model: "" }).model).toBe(
      DEFAULT_AI_CONFIG.model,
    );
  });

  it("baseUrl 清理尾斜杠，空值回退默认", () => {
    expect(sanitizeAiConfig({ baseUrl: "https://ai.test/v1///" }).baseUrl).toBe(
      "https://ai.test/v1",
    );
    expect(sanitizeAiConfig({}).baseUrl).toBe(DEFAULT_AI_CONFIG.baseUrl);
  });

  it("缺省配置精校关闭且指向本地 LM Studio", () => {
    expect(DEFAULT_AI_CONFIG.asrModel).toBe("");
    expect(DEFAULT_AI_CONFIG.baseUrl).toBe("http://localhost:1234/v1");
  });
});