import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { insertEntry, sanitizeIndex, toHistoryEntry } from "@/lib/history-core";
import {
  MAX_SESSION_JSON_BYTES,
  type HistoryEntry,
  type RehearsalSession,
  type TranscriptSegment,
} from "@/lib/rehearsal-types";
import { deleteRecording, listRecordingRefs } from "@/lib/recording-storage";

const INDEX_KEY = "pacebox.history.index.v1";

const sessionKey = (id: string) => `pacebox.session.${id}.v1`;

/** 超限时逐轮截短每段转写文本（保 metrics 与时间轴），防 AsyncStorage 超限 */
function shrinkSession(session: RehearsalSession): RehearsalSession {
  if (JSON.stringify(session).length <= MAX_SESSION_JSON_BYTES) return session;
  let perSegment = 200;
  let shrunk = session;
  while (perSegment >= 10) {
    const segments: TranscriptSegment[] = shrunk.segments.map((s) =>
      s.text.length > perSegment
        ? { ...s, text: `${s.text.slice(0, perSegment)}…` }
        : s,
    );
    shrunk = { ...shrunk, segments };
    if (JSON.stringify(shrunk).length <= MAX_SESSION_JSON_BYTES) break;
    perSegment = Math.floor(perSegment / 2);
  }
  return shrunk;
}

interface HistoryState {
  entries: HistoryEntry[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addSession: (session: RehearsalSession) => Promise<void>;
  /** AI 评分完成后回写整条 session 并刷新对应 entry */
  updateSession: (session: RehearsalSession) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  loadSession: (id: string) => Promise<RehearsalSession | null>;
}

async function persistIndex(entries: HistoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // 持久化失败不阻塞使用
  }
}

async function deleteSessionRecord(entry: HistoryEntry): Promise<void> {
  try {
    await AsyncStorage.removeItem(sessionKey(entry.id));
    if (entry.audioRef) await deleteRecording(entry.audioRef);
  } catch {
    // 忽略清理失败
  }
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    let entries: HistoryEntry[] = [];
    try {
      const raw = await AsyncStorage.getItem(INDEX_KEY);
      if (raw) entries = sanitizeIndex(JSON.parse(raw) as unknown);
    } catch {
      // 读取失败则使用空列表
    }
    set({ entries, hydrated: true });
    // 孤儿录音兜底清理：不属于任何 entry 的录音文件删除
    try {
      const referenced = new Set(
        entries.map((e) => e.audioRef).filter((r): r is string => r != null),
      );
      for (const ref of await listRecordingRefs()) {
        if (!referenced.has(ref)) await deleteRecording(ref);
      }
    } catch {
      // 忽略清理失败
    }
  },

  addSession: async (session) => {
    const entry = toHistoryEntry(session);
    const { next, evicted } = insertEntry(get().entries, entry);
    set({ entries: next });
    await persistIndex(next);
    try {
      await AsyncStorage.setItem(
        sessionKey(session.id),
        JSON.stringify(shrinkSession(session)),
      );
    } catch {
      // 写入失败忽略（entry 仍在列表，报告详情可能缺失）
    }
    for (const old of evicted) {
      await deleteSessionRecord(old);
    }
  },

  updateSession: async (session) => {
    const entry = toHistoryEntry(session);
    const entries = get().entries.map((e) => (e.id === entry.id ? entry : e));
    set({ entries });
    await persistIndex(entries);
    try {
      await AsyncStorage.setItem(
        sessionKey(session.id),
        JSON.stringify(shrinkSession(session)),
      );
    } catch {
      // 写入失败忽略
    }
  },

  removeSession: async (id) => {
    const target = get().entries.find((e) => e.id === id);
    const entries = get().entries.filter((e) => e.id !== id);
    set({ entries });
    await persistIndex(entries);
    if (target) await deleteSessionRecord(target);
  },

  loadSession: async (id) => {
    try {
      const raw = await AsyncStorage.getItem(sessionKey(id));
      if (!raw) return null;
      return JSON.parse(raw) as RehearsalSession;
    } catch {
      return null;
    }
  },
}));
