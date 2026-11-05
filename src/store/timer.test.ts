import { describe, expect, it } from "vitest";

import { reminderPoints, DEFAULT_SETTINGS } from "@/lib/timer-core";
import { useTimerStore } from "./timer";

const points = reminderPoints(DEFAULT_SETTINGS);
const t0 = 1_000_000;

function resetStore() {
  useTimerStore.getState().reset();
}

describe("timer store", () => {
  it("starts from idle with a fresh session", () => {
    resetStore();
    const s = useTimerStore.getState();
    expect(s.status).toBe("idle");
    expect(s.elapsedMs).toBe(0);
  });

  it("runs and fires reminders as time passes", () => {
    resetStore();
    useTimerStore.getState().start(t0);
    expect(useTimerStore.getState().status).toBe("running");

    let newly = useTimerStore.getState().tick(points, t0 + 12.5 * 60_000);
    expect(newly.map((p) => p.id)).toEqual(["first"]);

    newly = useTimerStore.getState().tick(points, t0 + 20 * 60_000);
    expect(newly.map((p) => p.id)).toEqual(["second"]);

    newly = useTimerStore.getState().tick(points, t0 + 25 * 60_000);
    expect(newly.map((p) => p.id)).toEqual(["end"]);
    expect(useTimerStore.getState().status).toBe("finished");
  });

  it("pause freezes elapsed time and resume continues", () => {
    resetStore();
    useTimerStore.getState().start(t0);
    useTimerStore.getState().tick(points, t0 + 5 * 60_000);
    useTimerStore.getState().pause(t0 + 6 * 60_000); // paused at 6min elapsed
    expect(useTimerStore.getState().status).toBe("paused");

    // 暂停期间 tick 不生效
    const newly = useTimerStore.getState().tick(points, t0 + 60 * 60_000);
    expect(newly).toEqual([]);

    useTimerStore.getState().start(t0 + 60 * 60_000); // resume
    const due = useTimerStore.getState().tick(points, t0 + 60 * 60_000 + 6.5 * 60_000);
    // 恢复后又过了 6.5 分钟，总计 12.5 分钟 -> 触发第一次提醒
    expect(due.map((p) => p.id)).toEqual(["first"]);
  });

  it("starting a finished timer begins a new session", () => {
    resetStore();
    useTimerStore.getState().start(t0);
    useTimerStore.getState().tick(points, t0 + 26 * 60_000);
    expect(useTimerStore.getState().status).toBe("finished");

    useTimerStore.getState().start(t0 + 1000);
    const s = useTimerStore.getState();
    expect(s.status).toBe("running");
    expect(s.elapsedMs).toBe(0);
    expect(s.fired).toEqual([]);
  });
});
