import { beforeEach, describe, expect, it } from "vitest";

import { useRehearsalStore } from "./rehearsal";

function resetStore() {
  useRehearsalStore.getState().reset();
}

describe("rehearsal store", () => {
  beforeEach(() => {
    resetStore();
  });

  it("interim 记录段起点，final 组装完整分段", () => {
    useRehearsalStore.getState().begin(1_000);
    useRehearsalStore.getState().pushInterim("你好", 1_000);
    useRehearsalStore.getState().pushInterim("你好世界", 2_000);
    expect(useRehearsalStore.getState().interimText).toBe("你好世界");
    expect(useRehearsalStore.getState().interimStartMs).toBe(1_000);

    useRehearsalStore.getState().pushFinal("你好世界", 3_000);
    const s = useRehearsalStore.getState();
    expect(s.segments).toEqual([
      { text: "你好世界", startMs: 1_000, endMs: 3_000, isFinal: true },
    ]);
    expect(s.interimText).toBe("");
    expect(s.interimStartMs).toBeNull();
  });

  it("无 interim 时 final 以当前时刻为段起点", () => {
    useRehearsalStore.getState().begin(1_000);
    useRehearsalStore.getState().pushFinal("开场白", 5_000);
    expect(useRehearsalStore.getState().segments[0]).toMatchObject({
      startMs: 5_000,
      endMs: 5_000,
    });
  });

  it("空文本 final 被忽略", () => {
    useRehearsalStore.getState().begin(1_000);
    useRehearsalStore.getState().pushFinal("   ", 5_000);
    expect(useRehearsalStore.getState().segments).toEqual([]);
  });

  it("暂停丢弃 interim，恢复后重新开始该段", () => {
    useRehearsalStore.getState().begin(1_000);
    useRehearsalStore.getState().pushInterim("半句话", 2_000);
    useRehearsalStore.getState().pause();
    expect(useRehearsalStore.getState().phase).toBe("paused");
    expect(useRehearsalStore.getState().interimText).toBe("");
    expect(useRehearsalStore.getState().interimStartMs).toBeNull();

    useRehearsalStore.getState().resume();
    useRehearsalStore.getState().pushInterim("新的半句", 8_000);
    expect(useRehearsalStore.getState().interimStartMs).toBe(8_000);
  });

  it("暂停期间收到的 final 照常入库", () => {
    useRehearsalStore.getState().begin(1_000);
    useRehearsalStore.getState().pause();
    useRehearsalStore.getState().pushFinal("收尾", 7_000);
    expect(useRehearsalStore.getState().segments).toHaveLength(1);
  });

  it("begin 清空上一轮数据但保留能力探测结果", () => {
    useRehearsalStore.getState().prepare({ transcription: false });
    useRehearsalStore.getState().begin(1_000);
    useRehearsalStore.getState().pushFinal("上一轮", 2_000);

    useRehearsalStore.getState().begin(50_000);
    const s = useRehearsalStore.getState();
    expect(s.phase).toBe("active");
    expect(s.segments).toEqual([]);
    expect(s.startedAt).toBe(50_000);
    expect(s.transcriptionSupported).toBe(false);
  });

  it("finalize 流转：beginFinalize -> finish", () => {
    useRehearsalStore.getState().begin(1_000);
    useRehearsalStore.getState().beginFinalize();
    expect(useRehearsalStore.getState().phase).toBe("finalizing");

    useRehearsalStore.getState().finish("session-1");
    const s = useRehearsalStore.getState();
    expect(s.phase).toBe("done");
    expect(s.lastSessionId).toBe("session-1");
  });

  it("idle/finalizing 阶段 push 被忽略", () => {
    useRehearsalStore.getState().pushFinal("未开始", 1_000);
    expect(useRehearsalStore.getState().segments).toEqual([]);

    useRehearsalStore.getState().begin(1_000);
    useRehearsalStore.getState().beginFinalize();
    useRehearsalStore.getState().pushFinal("已结束", 2_000);
    expect(useRehearsalStore.getState().segments).toEqual([]);
  });
});
