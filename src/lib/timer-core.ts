export interface TimerSettings {
  /** 总时长（分钟） */
  totalMinutes: number;
  /** 第一次提醒：已过去时间的百分比 1-99 */
  firstReminderPct: number;
  /** 第二次提醒：已过去时间的百分比 1-99 */
  secondReminderPct: number;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  totalMinutes: 25,
  firstReminderPct: 50,
  secondReminderPct: 75,
};

export type ReminderId = "first" | "second" | "end";

export interface ReminderPoint {
  id: ReminderId;
  /** 距计时开始的毫秒偏移 */
  atMs: number;
}

export const MIN_TOTAL_MINUTES = 1;
export const MAX_TOTAL_MINUTES = 24 * 60;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/** 清洗用户输入，保证设置合法：总时长有界，两次提醒为 1-99 的递增百分比 */
export function sanitizeSettings(input: Partial<TimerSettings>): TimerSettings {
  const totalMinutes = clamp(
    Math.round(toFiniteNumber(input.totalMinutes, DEFAULT_SETTINGS.totalMinutes)),
    MIN_TOTAL_MINUTES,
    MAX_TOTAL_MINUTES,
  );
  let firstReminderPct = clamp(
    Math.round(toFiniteNumber(input.firstReminderPct, DEFAULT_SETTINGS.firstReminderPct)),
    1,
    99,
  );
  let secondReminderPct = clamp(
    Math.round(toFiniteNumber(input.secondReminderPct, DEFAULT_SETTINGS.secondReminderPct)),
    1,
    99,
  );
  if (firstReminderPct >= secondReminderPct) {
    if (firstReminderPct >= 99) {
      firstReminderPct = 98;
      secondReminderPct = 99;
    } else {
      secondReminderPct = firstReminderPct + 1;
    }
  }
  return { totalMinutes, firstReminderPct, secondReminderPct };
}

export function totalDurationMs(settings: TimerSettings): number {
  return Math.round(settings.totalMinutes * 60_000);
}

/** 三个提醒时间点：第一次、第二次、结束 */
export function reminderPoints(settings: TimerSettings): ReminderPoint[] {
  const total = totalDurationMs(settings);
  return [
    { id: "first", atMs: Math.round((total * settings.firstReminderPct) / 100) },
    { id: "second", atMs: Math.round((total * settings.secondReminderPct) / 100) },
    { id: "end", atMs: total },
  ];
}

/** 已到达且尚未触发过的提醒点 */
export function dueReminders(
  elapsedMs: number,
  points: ReminderPoint[],
  fired: ReadonlySet<ReminderId>,
): ReminderPoint[] {
  return points.filter((p) => elapsedMs >= p.atMs && !fired.has(p.id));
}

/** 剩余毫秒 -> "mm:ss"（向上取整，开始即显示 25:00） */
export function formatClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 距开始的毫秒偏移 -> "mm:ss"（用于展示提醒时刻） */
export function formatOffset(offsetMs: number): string {
  const totalSeconds = Math.round(offsetMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
