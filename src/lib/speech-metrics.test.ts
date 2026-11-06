import { describe, expect, it } from "vitest";

import type { TranscriptSegment } from "@/lib/rehearsal-types";
import {
  computeSegmentProgress,
  computeSpeechMetrics,
  countChineseChars,
  countEnglishWords,
  countFillers,
  detectLang,
  findLongPauses,
} from "@/lib/speech-metrics";
import type { TimerSettings } from "@/lib/timer-core";

const SETTINGS: TimerSettings = {
  totalMinutes: 20,
  firstReminderPct: 50,
  secondReminderPct: 75,
};
// 提醒点：first 600_000ms / second 900_000ms / end 1_200_000ms

function seg(
  text: string,
  startMs: number,
  endMs: number,
  isFinal = true,
): TranscriptSegment {
  return { text, startMs, endMs, isFinal };
}

/** 两段中文共 300 字，有效说话时长恰好 1 分钟 */
function zhFixture(totalElapsedMs = 1_200_000) {
  return computeSpeechMetrics({
    segments: [
      seg("字".repeat(150), 10_000, 30_000),
      seg("字".repeat(150), 30_000, 70_000),
    ],
    settings: SETTINGS,
    totalElapsedMs,
  });
}

describe("基础统计", () => {
  it("统计中文字符与英文单词", () => {
    expect(countChineseChars("你好，世界！hello world")).toBe(4);
    expect(countEnglishWords("你好，世界！hello world")).toBe(2);
    expect(countChineseChars("")).toBe(0);
  });

  it("按占比判定语言", () => {
    expect(detectLang("你好世界 hello")).toBe("zh");
    expect(detectLang("hello world 你")).toBe("en");
    expect(detectLang("")).toBe("zh");
  });

  it("中文填充词计数与明细", () => {
    const { count, breakdown } = countFillers(
      "嗯，然后我们就是说，那个，开始吧",
      "zh",
    );
    expect(count).toBe(4);
    expect(breakdown).toEqual({ 嗯: 1, 然后: 1, 就是: 1, 那个: 1 });
  });

  it("英文填充词大小写不敏感、按词边界匹配", () => {
    const { count, breakdown } = countFillers(
      "So um, I basically like, you know, um again",
      "en",
    );
    expect(count).toBe(6);
    expect(breakdown).toEqual({
      so: 1,
      um: 2,
      basically: 1,
      like: 1,
      "you know": 1,
    });
  });
});

describe("语速", () => {
  it("中文按字/分手算", () => {
    const m = zhFixture();
    expect(m).not.toBeNull();
    expect(m!.lang).toBe("zh");
    expect(m!.totalChars).toBe(300);
    expect(m!.spokenDurationMs).toBe(60_000);
    expect(m!.charsPerMin).toBe(300);
    expect(m!.wordsPerMin).toBeNull();
  });

  it("英文按词/分手算", () => {
    const m = computeSpeechMetrics({
      segments: [
        seg("word ".repeat(60), 10_000, 30_000),
        seg("word ".repeat(60), 30_000, 70_000),
      ],
      settings: SETTINGS,
      totalElapsedMs: 1_200_000,
    });
    expect(m!.lang).toBe("en");
    expect(m!.totalWords).toBe(120);
    expect(m!.wordsPerMin).toBe(120);
    expect(m!.charsPerMin).toBeNull();
  });

  it("有效说话不足 5 秒时语速为 null", () => {
    const m = computeSpeechMetrics({
      segments: [seg("你好世界", 1_000, 4_000)],
      settings: SETTINGS,
      totalElapsedMs: 600_000,
    });
    expect(m!.spokenDurationMs).toBe(3_000);
    expect(m!.charsPerMin).toBeNull();
    expect(m!.fillerPerMin).toBe(0);
  });
});

describe("时间达成", () => {
  it.each([
    [1_068_000, 0.89, "under"],
    [1_080_000, 0.9, "on-target"],
    [1_320_000, 1.1, "on-target"],
    [1_332_000, 1.11, "over"],
  ] as const)("%i ms -> ratio %f / %s", (elapsed, ratio, status) => {
    const m = zhFixture(elapsed);
    expect(m!.timeAchievementRatio).toBe(ratio);
    expect(m!.timeStatus).toBe(status);
  });
});

describe("长停顿", () => {
  it("间隔恰好达到阈值即计入", () => {
    const gaps = findLongPauses([seg("a", 1_000, 2_000), seg("b", 4_000, 5_000)]);
    expect(gaps).toEqual([{ afterMs: 2_000, durationMs: 2_000 }]);
  });

  it("间隔差 1ms 不计入", () => {
    const gaps = findLongPauses([seg("a", 1_000, 2_000), seg("b", 3_999, 5_000)]);
    expect(gaps).toEqual([]);
  });

  it("开场延迟超过 5 秒单计", () => {
    const gaps = findLongPauses([seg("a", 6_000, 8_000)]);
    expect(gaps).toEqual([{ afterMs: 0, durationMs: 6_000 }]);
    expect(findLongPauses([seg("a", 5_000, 8_000)])).toEqual([]);
  });

  it("totalPauseMs 为长停顿之和", () => {
    const m = computeSpeechMetrics({
      segments: [
        seg("字".repeat(10), 6_000, 10_000),
        seg("字".repeat(10), 14_000, 20_000),
        seg("字".repeat(10), 30_000, 40_000),
      ],
      settings: SETTINGS,
      totalElapsedMs: 1_200_000,
    });
    // 开场 6s + 两段间隔 4s、10s
    expect(m!.longPauses).toHaveLength(3);
    expect(m!.totalPauseMs).toBe(20_000);
  });

  it("非 final 段不参与统计", () => {
    expect(findLongPauses([seg("a", 0, 1_000, false)])).toEqual([]);
    expect(
      computeSpeechMetrics({
        segments: [seg("a", 0, 1_000, false)],
        settings: SETTINGS,
        totalElapsedMs: 60_000,
      }),
    ).toBeNull();
  });
});

describe("分段进度", () => {
  it("各提醒点已说占比 vs 理想占比", () => {
    const progress = computeSegmentProgress(
      [
        seg("字".repeat(100), 0, 300_000),
        seg("字".repeat(50), 600_000, 800_000),
        seg("字".repeat(50), 900_000, 1_100_000),
      ],
      SETTINGS,
      "zh",
    );
    expect(progress).toHaveLength(3);
    expect(progress[0]).toMatchObject({
      reminderId: "first",
      spokenUnits: 100,
      spokenRatio: 0.5,
      expectedRatio: 0.5,
    });
    expect(progress[1]).toMatchObject({
      reminderId: "second",
      spokenUnits: 150,
      spokenRatio: 0.75,
      expectedRatio: 0.75,
    });
    expect(progress[2]).toMatchObject({
      reminderId: "end",
      spokenUnits: 200,
      spokenRatio: 1,
      expectedRatio: 1,
    });
  });

  it("无内容时占比为 0", () => {
    const progress = computeSegmentProgress([], SETTINGS, "zh");
    expect(progress.every((p) => p.spokenRatio === 0)).toBe(true);
    expect(progress[2].expectedRatio).toBe(1);
  });
});

describe("空输入", () => {
  it("空 segments 返回 null 且不抛错", () => {
    expect(
      computeSpeechMetrics({
        segments: [],
        settings: SETTINGS,
        totalElapsedMs: 1_200_000,
      }),
    ).toBeNull();
  });
});
