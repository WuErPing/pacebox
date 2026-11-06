import { describe, expect, it } from "vitest";

import { insertEntry, pruneHistory, sanitizeIndex, toHistoryEntry } from "./history-core";
import type { HistoryEntry, RehearsalSession } from "./rehearsal-types";

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

function makeEntry(id: string, startedAt: number): HistoryEntry {
  return toHistoryEntry(makeSession({ id, startedAt }));
}

describe("toHistoryEntry", () => {
  it("maps a bare session to null metric fields", () => {
    const entry = toHistoryEntry(makeSession({ audioRef: "file:///a.wav" }));
    expect(entry).toMatchObject({
      id: "s1",
      startedAt: 1000,
      totalMinutes: 20,
      lang: null,
      rate: null,
      fillerCount: null,
      aiStatus: "unconfigured",
      aiTotal: null,
      hasAudio: true,
      audioRef: "file:///a.wav",
    });
  });

  it("prefers charsPerMin over wordsPerMin for rate", () => {
    const zh = makeSession({
      metrics: { lang: "zh", charsPerMin: 220, wordsPerMin: null } as never,
    });
    expect(toHistoryEntry(zh).rate).toBe(220);
    const en = makeSession({
      metrics: { lang: "en", charsPerMin: null, wordsPerMin: 140 } as never,
    });
    expect(toHistoryEntry(en).rate).toBe(140);
  });

  it("maps aiScore.total to aiTotal", () => {
    const scored = makeSession({
      aiStatus: "done",
      aiScore: { total: 87 } as never,
    });
    expect(toHistoryEntry(scored)).toMatchObject({ aiStatus: "done", aiTotal: 87 });
  });
});

describe("pruneHistory / insertEntry", () => {
  it("keeps newest up to limit and evicts the oldest", () => {
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(`id-${i}`, i));
    const { next, evicted } = insertEntry(entries, makeEntry("newest", 100));
    expect(next).toHaveLength(20);
    expect(evicted.map((e) => e.id)).toEqual(["id-0"]);
    expect(next[0]?.id).toBe("newest");
  });

  it("re-inserting the same id replaces instead of duplicating", () => {
    const entries = [makeEntry("a", 1), makeEntry("b", 2)];
    const { next } = insertEntry(entries, makeEntry("a", 1));
    expect(next.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("pruneHistory sorts descending by startedAt", () => {
    const { kept } = pruneHistory([makeEntry("old", 1), makeEntry("new", 9)]);
    expect(kept.map((e) => e.id)).toEqual(["new", "old"]);
  });
});

describe("sanitizeIndex", () => {
  it("drops malformed items and coerces fields", () => {
    const raw = [
      null,
      "junk",
      { id: 42 },
      { id: "ok", startedAt: 5, totalMinutes: "20", aiStatus: "weird", rate: "x" },
    ];
    const entries = sanitizeIndex(raw);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "ok",
      startedAt: 5,
      totalMinutes: 20,
      aiStatus: "unconfigured",
      rate: null,
      hasAudio: false,
      audioRef: null,
    });
  });

  it("returns empty list for non-array input and caps at 20", () => {
    expect(sanitizeIndex("nope")).toEqual([]);
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `i${i}`, startedAt: i }));
    expect(sanitizeIndex(many)).toHaveLength(20);
  });
});
