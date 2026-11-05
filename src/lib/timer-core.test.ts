import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  dueReminders,
  formatClock,
  formatOffset,
  reminderPoints,
  sanitizeSettings,
  totalDurationMs,
} from "./timer-core";

describe("sanitizeSettings", () => {
  it("keeps valid input unchanged", () => {
    expect(sanitizeSettings({ totalMinutes: 45, firstReminderPct: 30, secondReminderPct: 80 }))
      .toEqual({ totalMinutes: 45, firstReminderPct: 30, secondReminderPct: 80 });
  });

  it("falls back to defaults on invalid numbers", () => {
    expect(sanitizeSettings({ totalMinutes: Number.NaN })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps total minutes into range", () => {
    expect(sanitizeSettings({ totalMinutes: 0 }).totalMinutes).toBe(1);
    expect(sanitizeSettings({ totalMinutes: 99999 }).totalMinutes).toBe(24 * 60);
  });

  it("clamps percentages into 1..99", () => {
    const s = sanitizeSettings({ firstReminderPct: -5, secondReminderPct: 250 });
    expect(s.firstReminderPct).toBe(1);
    expect(s.secondReminderPct).toBe(99);
  });

  it("enforces first < second", () => {
    const s = sanitizeSettings({ firstReminderPct: 75, secondReminderPct: 75 });
    expect(s.firstReminderPct).toBeLessThan(s.secondReminderPct);

    const edge = sanitizeSettings({ firstReminderPct: 99, secondReminderPct: 99 });
    expect(edge.firstReminderPct).toBe(98);
    expect(edge.secondReminderPct).toBe(99);
  });
});

describe("reminderPoints", () => {
  it("matches the 25min defaults: half, 3/4, end", () => {
    const points = reminderPoints(DEFAULT_SETTINGS);
    expect(points).toEqual([
      { id: "first", atMs: 12.5 * 60_000 },
      { id: "second", atMs: 18.75 * 60_000 },
      { id: "end", atMs: 25 * 60_000 },
    ]);
  });

  it("scales with total time", () => {
    const points = reminderPoints({ totalMinutes: 10, firstReminderPct: 50, secondReminderPct: 90 });
    expect(points.map((p) => p.atMs)).toEqual([5 * 60_000, 9 * 60_000, 10 * 60_000]);
  });
});

describe("dueReminders", () => {
  const points = reminderPoints(DEFAULT_SETTINGS);

  it("fires each reminder exactly once when crossing its point", () => {
    const fired = new Set<"first" | "second" | "end">();

    expect(dueReminders(12.49 * 60_000, points, fired)).toEqual([]);

    let due = dueReminders(12.5 * 60_000, points, fired);
    expect(due.map((p) => p.id)).toEqual(["first"]);
    due.forEach((p) => fired.add(p.id));

    due = dueReminders(19 * 60_000, points, fired);
    expect(due.map((p) => p.id)).toEqual(["second"]);
    due.forEach((p) => fired.add(p.id));

    due = dueReminders(26 * 60_000, points, fired);
    expect(due.map((p) => p.id)).toEqual(["end"]);
    due.forEach((p) => fired.add(p.id));

    expect(dueReminders(30 * 60_000, points, fired)).toEqual([]);
  });

  it("catches up multiple reminders after a long gap (e.g. backgrounded tab)", () => {
    const due = dueReminders(20 * 60_000, points, new Set());
    expect(due.map((p) => p.id)).toEqual(["first", "second"]);
  });
});

describe("formatClock / formatOffset", () => {
  it("formats remaining time as mm:ss, ceiling so start shows the full minute", () => {
    expect(formatClock(totalDurationMs(DEFAULT_SETTINGS))).toBe("25:00");
    expect(formatClock(25 * 60_000 - 1)).toBe("25:00");
    expect(formatClock(25 * 60_000 - 1000)).toBe("24:59");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-100)).toBe("00:00");
  });

  it("formats reminder offsets", () => {
    expect(formatOffset(12.5 * 60_000)).toBe("12:30");
    expect(formatOffset(18.75 * 60_000)).toBe("18:45");
  });
});
