import type { TimerSettings } from "@/lib/timer-core";

export interface ScenePreset {
  label: string;
  settings: TimerSettings;
}

/** 演讲/会议场景预设：主题演讲 20 / 30 分钟（提醒点沿用 50% / 75% 缺省） */
export const SCENE_PRESETS: ScenePreset[] = [
  {
    label: "主题演讲 20 分钟",
    settings: { totalMinutes: 20, firstReminderPct: 50, secondReminderPct: 75 },
  },
  {
    label: "主题演讲 30 分钟",
    settings: { totalMinutes: 30, firstReminderPct: 50, secondReminderPct: 75 },
  },
];

export function matchesPreset(
  settings: TimerSettings,
  preset: ScenePreset,
): boolean {
  return (
    settings.totalMinutes === preset.settings.totalMinutes &&
    settings.firstReminderPct === preset.settings.firstReminderPct &&
    settings.secondReminderPct === preset.settings.secondReminderPct
  );
}
