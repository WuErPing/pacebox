import {
  MAX_HISTORY,
  type HistoryEntry,
  type RehearsalSession,
} from "@/lib/rehearsal-types";

export function toHistoryEntry(session: RehearsalSession): HistoryEntry {
  const { metrics } = session;
  return {
    id: session.id,
    startedAt: session.startedAt,
    totalMinutes: session.settings.totalMinutes,
    totalElapsedMs: session.totalElapsedMs,
    lang: metrics?.lang ?? null,
    rate: metrics ? (metrics.charsPerMin ?? metrics.wordsPerMin) : null,
    fillerCount: metrics?.fillerCount ?? null,
    aiStatus: session.aiStatus,
    aiTotal: session.aiScore?.total ?? null,
    hasAudio: session.audioRef != null,
    audioRef: session.audioRef,
  };
}

/** 按 startedAt 降序裁剪到 limit 条，返回保留与被淘汰部分 */
export function pruneHistory(
  entries: HistoryEntry[],
  limit: number = MAX_HISTORY,
): { kept: HistoryEntry[]; evicted: HistoryEntry[] } {
  const sorted = [...entries].sort((a, b) => b.startedAt - a.startedAt);
  return { kept: sorted.slice(0, limit), evicted: sorted.slice(limit) };
}

/** 插入新条目（同 id 覆盖），裁剪后返回下一版列表与需清理的淘汰项 */
export function insertEntry(
  entries: HistoryEntry[],
  entry: HistoryEntry,
  limit: number = MAX_HISTORY,
): { next: HistoryEntry[]; evicted: HistoryEntry[] } {
  const merged = [entry, ...entries.filter((e) => e.id !== entry.id)];
  const { kept, evicted } = pruneHistory(merged, limit);
  return { next: kept, evicted };
}

/** 校验从存储读回的 index：仅保留形状合法的条目 */
export function sanitizeIndex(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: HistoryEntry[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const e = item as Partial<HistoryEntry>;
    if (typeof e.id !== "string" || typeof e.startedAt !== "number") continue;
    entries.push({
      id: e.id,
      startedAt: e.startedAt,
      totalMinutes: Number(e.totalMinutes) || 0,
      totalElapsedMs: Number(e.totalElapsedMs) || 0,
      lang: e.lang === "zh" || e.lang === "en" ? e.lang : null,
      rate: typeof e.rate === "number" ? e.rate : null,
      fillerCount: typeof e.fillerCount === "number" ? e.fillerCount : null,
      aiStatus:
        e.aiStatus === "done" ||
        e.aiStatus === "pending" ||
        e.aiStatus === "error" ||
        e.aiStatus === "unconfigured"
          ? e.aiStatus
          : "unconfigured",
      aiTotal: typeof e.aiTotal === "number" ? e.aiTotal : null,
      hasAudio: e.hasAudio === true,
      audioRef: typeof e.audioRef === "string" ? e.audioRef : null,
    });
  }
  return pruneHistory(entries, MAX_HISTORY).kept;
}
