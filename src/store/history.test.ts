import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RehearsalSession } from "@/lib/rehearsal-types";

import { useHistoryStore } from "./history";

const { storage, recMock } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  recMock: { deleted: [] as string[], refs: [] as string[] },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.delete(key);
    },
  },
}));

vi.mock("@/lib/recording-storage", () => ({
  deleteRecording: async (ref: string) => {
    recMock.deleted.push(ref);
  },
  listRecordingRefs: async () => recMock.refs,
  persistRecording: async () => null,
  loadRecordingBlob: async () => null,
}));

function makeSession(overrides: Partial<RehearsalSession> = {}): RehearsalSession {
  return {
    id: "s1",
    startedAt: 1000,
    endedAt: 2000,
    settings: { totalMinutes: 20, firstReminderPct: 50, secondReminderPct: 75 },
    completedNaturally: true,
    totalElapsedMs: 20 * 60_000,
    transcriptionSupported: true,
    segments: [],
    metrics: null,
    aiStatus: "unconfigured",
    aiScore: null,
    aiError: null,
    audioRef: null,
    audioMime: null,
    ...overrides,
  };
}

beforeEach(() => {
  storage.clear();
  recMock.deleted = [];
  recMock.refs = [];
  useHistoryStore.setState({ entries: [], hydrated: false });
});

describe("history store", () => {
  it("addSession persists index + session record", async () => {
    await useHistoryStore.getState().addSession(makeSession({ id: "a" }));
    expect(useHistoryStore.getState().entries.map((e) => e.id)).toEqual(["a"]);
    expect(storage.has("pacebox.history.index.v1")).toBe(true);
    expect(storage.has("pacebox.session.a.v1")).toBe(true);
  });

  it("evicts the oldest beyond 20 and cleans its record + recording", async () => {
    for (let i = 0; i < 20; i++) {
      await useHistoryStore
        .getState()
        .addSession(makeSession({ id: `s-${i}`, startedAt: i, audioRef: `file:///r/${i}.wav` }));
    }
    expect(useHistoryStore.getState().entries).toHaveLength(20);

    await useHistoryStore
      .getState()
      .addSession(makeSession({ id: "newest", startedAt: 99 }));

    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(20);
    expect(entries.some((e) => e.id === "s-0")).toBe(false);
    expect(storage.has("pacebox.session.s-0.v1")).toBe(false);
    expect(recMock.deleted).toEqual(["file:///r/0.wav"]);
  });

  it("updateSession refreshes entry aiTotal", async () => {
    await useHistoryStore.getState().addSession(makeSession({ id: "a" }));
    const loaded = await useHistoryStore.getState().loadSession("a");
    expect(loaded).not.toBeNull();

    await useHistoryStore.getState().updateSession({
      ...loaded!,
      aiStatus: "done",
      aiScore: { total: 91 } as never,
    });

    expect(useHistoryStore.getState().entries[0]).toMatchObject({
      aiStatus: "done",
      aiTotal: 91,
    });
    const persisted = JSON.parse(storage.get("pacebox.session.a.v1")!) as RehearsalSession;
    expect(persisted.aiScore?.total).toBe(91);
  });

  it("removeSession deletes record and recording", async () => {
    await useHistoryStore
      .getState()
      .addSession(makeSession({ id: "a", audioRef: "idb:a" }));
    await useHistoryStore.getState().removeSession("a");
    expect(useHistoryStore.getState().entries).toEqual([]);
    expect(storage.has("pacebox.session.a.v1")).toBe(false);
    expect(recMock.deleted).toEqual(["idb:a"]);
  });

  it("hydrate loads index and deletes orphan recordings", async () => {
    await useHistoryStore
      .getState()
      .addSession(makeSession({ id: "a", audioRef: "file:///r/a.wav" }));
    recMock.refs = ["file:///r/a.wav", "file:///r/orphan.wav"];
    useHistoryStore.setState({ entries: [], hydrated: false });

    await useHistoryStore.getState().hydrate();

    expect(useHistoryStore.getState().entries.map((e) => e.id)).toEqual(["a"]);
    expect(recMock.deleted).toEqual(["file:///r/orphan.wav"]);
  });

  it("shrinks oversized session transcripts before persisting", async () => {
    const huge = "字".repeat(3000);
    const segments = Array.from({ length: 250 }, (_, i) => ({
      text: huge,
      startMs: i * 1000,
      endMs: i * 1000 + 900,
      isFinal: true,
    }));
    await useHistoryStore.getState().addSession(makeSession({ id: "big", segments }));
    const raw = storage.get("pacebox.session.big.v1")!;
    expect(raw.length).toBeLessThanOrEqual(512 * 1024);
    const persisted = JSON.parse(raw) as RehearsalSession;
    expect(persisted.segments).toHaveLength(250); // 时间轴保留，仅文本截短
    expect(persisted.segments[0]!.text.length).toBeLessThan(huge.length);
  });
});
