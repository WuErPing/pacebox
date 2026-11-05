import { create } from "zustand";

import {
  dueReminders,
  type ReminderId,
  type ReminderPoint,
} from "@/lib/timer-core";

export type TimerStatus = "idle" | "running" | "paused" | "finished";

interface TimerState {
  status: TimerStatus;
  /** 本轮（重新）开始的 epoch ms；paused/idle 时为 null */
  startedAt: number | null;
  /** 暂停前累计的毫秒 */
  accumulatedMs: number;
  /** 最近一次 tick 计算出的已用毫秒 */
  elapsedMs: number;
  /** 本轮已触发过的提醒 */
  fired: ReminderId[];

  start: (now?: number) => void;
  pause: (now?: number) => void;
  reset: () => void;
  /** 前进时钟，返回本次新触发的提醒点（由调用方负责响铃/通知） */
  tick: (points: ReminderPoint[], now?: number) => ReminderPoint[];
}

export const useTimerStore = create<TimerState>((set, get) => ({
  status: "idle",
  startedAt: null,
  accumulatedMs: 0,
  elapsedMs: 0,
  fired: [],

  start: (now = Date.now()) => {
    const { status } = get();
    if (status === "running") return;
    if (status === "paused") {
      set({ status: "running", startedAt: now });
    } else {
      // idle / finished -> 全新一轮
      set({ status: "running", startedAt: now, accumulatedMs: 0, elapsedMs: 0, fired: [] });
    }
  },

  pause: (now = Date.now()) => {
    const { status, startedAt, accumulatedMs } = get();
    if (status !== "running" || startedAt == null) return;
    set({
      status: "paused",
      startedAt: null,
      accumulatedMs: accumulatedMs + now - startedAt,
    });
  },

  reset: () => {
    set({ status: "idle", startedAt: null, accumulatedMs: 0, elapsedMs: 0, fired: [] });
  },

  tick: (points, now = Date.now()) => {
    const { status, startedAt, accumulatedMs, fired } = get();
    if (status !== "running" || startedAt == null) return [];

    const elapsedMs = accumulatedMs + now - startedAt;
    const newly = dueReminders(elapsedMs, points, new Set(fired));
    const reachedEnd = newly.some((p) => p.id === "end");

    set({
      elapsedMs,
      fired: newly.length > 0 ? [...fired, ...newly.map((p) => p.id)] : fired,
      status: reachedEnd ? "finished" : "running",
      ...(reachedEnd ? { startedAt: null, accumulatedMs: elapsedMs } : {}),
    });
    return newly;
  },
}));
