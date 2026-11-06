import { useEffect, useMemo } from "react";

import { promptFor, reminderNotification } from "@/lib/messages";
import {
  cancelScheduled,
  notifyNow,
  scheduleAhead,
} from "@/lib/notifier";
import {
  formatOffset,
  reminderPoints,
  totalDurationMs,
  type ReminderPoint,
} from "@/lib/timer-core";
import { speak } from "@/lib/voice";
import { useSettingsStore } from "@/store/settings";
import { useTimerStore } from "@/store/timer";

const TICK_MS = 250;

function messageFor(
  point: ReminderPoint,
  totalMs: number,
): { title: string; body: string } {
  return reminderNotification(
    point.id,
    formatOffset(point.atMs),
    formatOffset(Math.max(0, totalMs - point.atMs)),
  );
}

/**
 * 计时引擎：驱动 tick、触发语音与通知，并在原生端预调度后台通知。
 * 挂载一次即可（计时器页面）。
 */
export function useTimerEngine(): void {
  const settings = useSettingsStore((s) => s.settings);
  const status = useTimerStore((s) => s.status);
  const points = useMemo(() => reminderPoints(settings), [settings]);
  const totalMs = totalDurationMs(settings);

  // tick 循环：到点语音播报 + 立即通知
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      const newly = useTimerStore.getState().tick(points);
      for (const point of newly) {
        const { title, body } = messageFor(point, totalMs);
        speak(promptFor(point.id));
        void notifyNow(title, body);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [status, points, totalMs]);

  // 运行期间预调度系统通知（原生端后台兜底），暂停/重置/结束时取消
  useEffect(() => {
    if (status !== "running") {
      void cancelScheduled();
      return;
    }
    const elapsedMs = useTimerStore.getState().elapsedMs;
    const titles = {} as Record<ReminderPoint["id"], string>;
    const bodies = {} as Record<ReminderPoint["id"], string>;
    for (const point of points) {
      const message = messageFor(point, totalMs);
      titles[point.id] = message.title;
      bodies[point.id] = message.body;
    }
    void scheduleAhead(points, elapsedMs, titles, bodies);
    return () => {
      void cancelScheduled();
    };
  }, [status, points, totalMs]);
}
