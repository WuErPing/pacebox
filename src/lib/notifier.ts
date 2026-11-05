import * as Notifications from "expo-notifications";

import type { ReminderPoint } from "@/lib/timer-core";

// 前台展示时不播放通知自带声音，由 bell 模块统一响铃，避免双重声音
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** 立即弹出一条系统通知（带默认提示音） */
export async function notifyNow(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: "default" },
    trigger: null,
  });
}

/**
 * 为剩余的提醒点预调度系统通知。
 * App 退到后台后 JS 计时会被挂起，预调度保证提醒/响铃仍然准时到达。
 */
export async function scheduleAhead(
  points: ReminderPoint[],
  elapsedMs: number,
  titles: Record<ReminderPoint["id"], string>,
  bodies: Record<ReminderPoint["id"], string>,
): Promise<void> {
  await cancelScheduled();
  const now = Date.now();
  for (const point of points) {
    const remaining = point.atMs - elapsedMs;
    if (remaining <= 0) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: titles[point.id], body: bodies[point.id], sound: "default" },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(now + remaining),
      },
    });
  }
}

export async function cancelScheduled(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
