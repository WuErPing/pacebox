import type { ReminderPoint } from "@/lib/timer-core";

/**
 * Web (macOS 浏览器 / PWA) 实现：
 * 系统提示走 Web Notification API，macOS 会渲染为系统横幅通知。
 * 注意：Web 无法预调度，页面需保持打开（可在后台标签页）。
 */

export async function ensurePermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export async function notifyNow(title: string, body: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  try {
    new Notification(title, { body });
  } catch {
    // 某些浏览器要求经由 ServiceWorker 弹出，忽略失败
  }
}

export async function scheduleAhead(
  _points: ReminderPoint[],
  _elapsedMs: number,
  _titles: Record<ReminderPoint["id"], string>,
  _bodies: Record<ReminderPoint["id"], string>,
): Promise<void> {
  // Web 端不支持预调度，由 tick 实时触发
}

export async function cancelScheduled(): Promise<void> {
  // no-op
}
