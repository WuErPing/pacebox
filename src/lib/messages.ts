import type { ReminderId } from "@/lib/timer-core";

export type Language = "zh" | "en";
export type PromptId = ReminderId | "test";

/** 中文环境用中文，其余回退英文 */
export function resolveLanguage(locale: string): Language {
  return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function currentLanguage(): Language {
  try {
    return resolveLanguage(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return "en";
  }
}

const VOICE_PROMPTS: Record<Language, Record<PromptId, string>> = {
  zh: {
    first: "第一次提醒",
    second: "第二次提醒",
    end: "时间到",
    test: "语音提示工作正常",
  },
  en: {
    first: "First reminder",
    second: "Second reminder",
    end: "Time's up",
    test: "Voice prompt is working",
  },
};

export function promptFor(
  id: PromptId,
  language: Language = currentLanguage(),
): string {
  return VOICE_PROMPTS[language][id];
}

interface NotificationText {
  title: string;
  body: string;
}

const REMINDER_TITLES: Record<Language, Record<ReminderId, string>> = {
  zh: {
    first: "第一次提醒",
    second: "第二次提醒",
    end: "时间到",
  },
  en: {
    first: "First reminder",
    second: "Second reminder",
    end: "Time's up",
  },
};

export function reminderNotification(
  id: ReminderId,
  elapsed: string,
  remaining: string,
  language: Language = currentLanguage(),
): NotificationText {
  return {
    title: REMINDER_TITLES[language][id],
    body:
      id === "end"
        ? language === "zh"
          ? "本轮计时结束"
          : "This round is over"
        : language === "zh"
          ? `已过 ${elapsed}，还剩 ${remaining}`
          : `Elapsed ${elapsed}, ${remaining} left`,
  };
}

const TEST_NOTIFICATION: Record<Language, NotificationText> = {
  zh: {
    title: "Pacebox 测试提醒",
    body: "语音提示与系统提示工作正常",
  },
  en: {
    title: "Pacebox test notification",
    body: "Voice prompt and system notifications are working",
  },
};

export function testNotification(
  language: Language = currentLanguage(),
): NotificationText {
  return TEST_NOTIFICATION[language];
}
