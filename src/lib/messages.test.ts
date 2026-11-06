import { describe, expect, it } from "vitest";

import {
  currentLanguage,
  promptFor,
  reminderNotification,
  resolveLanguage,
  testNotification,
} from "./messages";

describe("resolveLanguage", () => {
  it("uses Chinese for zh locales", () => {
    expect(resolveLanguage("zh-CN")).toBe("zh");
    expect(resolveLanguage("zh-Hans-CN")).toBe("zh");
    expect(resolveLanguage("ZH")).toBe("zh");
  });

  it("falls back to English for other locales", () => {
    expect(resolveLanguage("en-US")).toBe("en");
    expect(resolveLanguage("ja-JP")).toBe("en");
    expect(resolveLanguage("")).toBe("en");
  });
});

describe("promptFor", () => {
  it("returns concise Chinese prompts", () => {
    expect(promptFor("first", "zh")).toBe("第一次提醒");
    expect(promptFor("second", "zh")).toBe("第二次提醒");
    expect(promptFor("end", "zh")).toBe("时间到");
    expect(promptFor("test", "zh")).toBe("语音提示工作正常");
  });

  it("returns concise English prompts", () => {
    expect(promptFor("first", "en")).toBe("First reminder");
    expect(promptFor("second", "en")).toBe("Second reminder");
    expect(promptFor("end", "en")).toBe("Time's up");
    expect(promptFor("test", "en")).toBe("Voice prompt is working");
  });
});

describe("reminderNotification", () => {
  it("localizes reminder titles and bodies", () => {
    expect(reminderNotification("first", "12:30", "12:30", "zh")).toEqual({
      title: "第一次提醒",
      body: "已过 12:30，还剩 12:30",
    });
    expect(reminderNotification("first", "12:30", "12:30", "en")).toEqual({
      title: "First reminder",
      body: "Elapsed 12:30, 12:30 left",
    });
    expect(reminderNotification("end", "25:00", "00:00", "zh")).toEqual({
      title: "时间到",
      body: "本轮计时结束",
    });
    expect(reminderNotification("end", "25:00", "00:00", "en")).toEqual({
      title: "Time's up",
      body: "This round is over",
    });
  });
});

describe("testNotification", () => {
  it("localizes the test notification", () => {
    expect(testNotification("zh")).toEqual({
      title: "Pacebox 测试提醒",
      body: "语音提示与系统提示工作正常",
    });
    expect(testNotification("en")).toEqual({
      title: "Pacebox test notification",
      body: "Voice prompt and system notifications are working",
    });
  });
});

describe("currentLanguage", () => {
  it("resolves from the runtime locale", () => {
    expect(["zh", "en"]).toContain(currentLanguage());
  });
});
