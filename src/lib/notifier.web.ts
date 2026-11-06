import type { ReminderPoint } from "@/lib/timer-core";

/**
 * Web 实现：
 * 1. 优先调用本机通知服务（scripts/notify-server.mjs），由服务端执行 osascript，
 *    macOS 计入「脚本编辑器」的通知，不受浏览器通知权限/横幅设置影响；
 * 2. 服务未启动或调用失败时回退到 Web Notification API。
 *
 * 注意：Web 无法预调度，页面需保持打开（可在后台标签页）。
 */

const NOTIFY_SERVER_URL = "http://127.0.0.1:39527";
const SERVER_TIMEOUT_MS = 1200;

async function requestWithTimeout(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function serverAvailable(): Promise<boolean> {
  try {
    const res = await requestWithTimeout(`${NOTIFY_SERVER_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function notifyViaServer(title: string, body: string): Promise<boolean> {
  try {
    const res = await requestWithTimeout(`${NOTIFY_SERVER_URL}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensurePermission(): Promise<boolean> {
  if (await serverAvailable()) return true;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export async function notifyNow(title: string, body: string): Promise<boolean> {
  if (await notifyViaServer(title, body)) return true;

  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return false;
  }
  try {
    new Notification(title, { body });
    return true;
  } catch {
    // 某些浏览器要求经由 ServiceWorker 弹出，忽略失败
    return false;
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
