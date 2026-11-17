import { describe, expect, it } from "vitest";

import {
  AI_PROVIDER_PRESETS,
  MIMO_ASR_MODEL,
  MIMO_BASE_URL,
  MODEL_PRESETS,
  matchesProvider,
} from "@/lib/ai-presets";

describe("ai-presets", () => {
  it("MiMo 预设指向 token-plan 接口与 mimo-v2.6-flash", () => {
    const mimo = AI_PROVIDER_PRESETS.find((p) => p.label === "小米 MiMo");
    expect(mimo?.baseUrl).toBe(MIMO_BASE_URL);
    expect(mimo?.model).toBe("mimo-v2.6-flash");
    expect(MIMO_ASR_MODEL).toBe("mimo-v2.5-asr");
    expect(MODEL_PRESETS).toContain("mimo-v2.6-flash");
  });

  it("matchesProvider 按 baseUrl 匹配且容忍尾斜杠", () => {
    const mimo = AI_PROVIDER_PRESETS[1];
    expect(matchesProvider({ baseUrl: MIMO_BASE_URL }, mimo)).toBe(true);
    expect(matchesProvider({ baseUrl: `${MIMO_BASE_URL}/` }, mimo)).toBe(true);
    expect(
      matchesProvider({ baseUrl: "http://localhost:1234/v1" }, mimo),
    ).toBe(false);
  });
});