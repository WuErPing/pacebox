import type {
  PauseGap,
  SegmentProgressItem,
  SpeechLang,
  SpeechMetrics,
  TranscriptSegment,
} from "@/lib/rehearsal-types";
import {
  reminderPoints,
  totalDurationMs,
  type TimerSettings,
} from "@/lib/timer-core";

export const FILLER_WORDS_ZH = [
  "嗯",
  "呃",
  "啊",
  "然后",
  "就是",
  "其实",
  "那个",
  "这个",
  "对吧",
  "你知道",
  "反正",
];

export const FILLER_WORDS_EN = [
  "um",
  "uh",
  "like",
  "you know",
  "actually",
  "basically",
  "so",
];

const ZH_CHAR_RE = /[\u4e00-\u9fff]/g;
const EN_WORD_RE = /[A-Za-z0-9'’-]+/g;
const LONG_PAUSE_THRESHOLD_MS = 2000;
const OPENING_DELAY_MS = 5000;
/** 有效说话时长低于该值时语速不可信，返回 null */
const MIN_SPOKEN_MS = 5000;

export function countChineseChars(text: string): number {
  return (text.match(ZH_CHAR_RE) ?? []).length;
}

export function countEnglishWords(text: string): number {
  return (text.match(EN_WORD_RE) ?? []).length;
}

export function detectLang(text: string): SpeechLang {
  return countChineseChars(text) >= countEnglishWords(text) ? "zh" : "en";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countWordOccurrences(text: string, word: string, lang: SpeechLang): number {
  if (lang === "zh") {
    let count = 0;
    let idx = text.indexOf(word);
    while (idx !== -1) {
      count += 1;
      idx = text.indexOf(word, idx + word.length);
    }
    return count;
  }
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
  return (text.match(re) ?? []).length;
}

export function countFillers(
  text: string,
  lang: SpeechLang,
): { count: number; breakdown: Record<string, number> } {
  const words = lang === "zh" ? FILLER_WORDS_ZH : FILLER_WORDS_EN;
  const breakdown: Record<string, number> = {};
  let count = 0;
  for (const word of words) {
    const n = countWordOccurrences(text, word, lang);
    if (n > 0) {
      breakdown[word] = n;
      count += n;
    }
  }
  return { count, breakdown };
}

function usableFinals(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments
    .filter((s) => s.isFinal && s.text.trim().length > 0)
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * 长停顿：相邻 final 段间隔 >= thresholdMs。
 * 时间基准是计时器 elapsedMs，暂停时段天然不计入，无需排除暂停窗口。
 * 开场延迟（首段开始 > 5s）单独计为一次停顿。
 */
export function findLongPauses(
  segments: TranscriptSegment[],
  thresholdMs: number = LONG_PAUSE_THRESHOLD_MS,
): PauseGap[] {
  const finals = usableFinals(segments);
  const gaps: PauseGap[] = [];
  if (finals.length === 0) return gaps;
  if (finals[0].startMs > OPENING_DELAY_MS) {
    gaps.push({ afterMs: 0, durationMs: finals[0].startMs });
  }
  for (let i = 1; i < finals.length; i++) {
    const gap = finals[i].startMs - finals[i - 1].endMs;
    if (gap >= thresholdMs) {
      gaps.push({ afterMs: finals[i - 1].endMs, durationMs: gap });
    }
  }
  return gaps;
}

function unitsIn(text: string, lang: SpeechLang): number {
  return lang === "zh" ? countChineseChars(text) : countEnglishWords(text);
}

/** 各提醒点处已说内容占比 vs 理想占比（= 时间百分比） */
export function computeSegmentProgress(
  segments: TranscriptSegment[],
  settings: TimerSettings,
  lang: SpeechLang,
): SegmentProgressItem[] {
  const points = reminderPoints(settings);
  const totalMs = totalDurationMs(settings);
  const finals = usableFinals(segments);
  const totalUnits = finals.reduce((sum, s) => sum + unitsIn(s.text, lang), 0);
  return points.map((point) => {
    const spokenUnits = finals
      .filter((s) => s.endMs <= point.atMs)
      .reduce((sum, s) => sum + unitsIn(s.text, lang), 0);
    return {
      reminderId: point.id,
      atMs: point.atMs,
      spokenUnits,
      spokenRatio: totalUnits > 0 ? spokenUnits / totalUnits : 0,
      expectedRatio: totalMs > 0 ? point.atMs / totalMs : 0,
    };
  });
}

export interface SpeechMetricsInput {
  segments: TranscriptSegment[];
  settings: TimerSettings;
  totalElapsedMs: number;
}

export function computeSpeechMetrics({
  segments,
  settings,
  totalElapsedMs,
}: SpeechMetricsInput): SpeechMetrics | null {
  const finals = usableFinals(segments);
  if (finals.length === 0) return null;

  const allText = finals.map((s) => s.text).join("\n");
  const lang = detectLang(allText);
  const totalChars = countChineseChars(allText);
  const totalWords = countEnglishWords(allText);

  const spokenDurationMs = Math.max(
    0,
    finals[finals.length - 1].endMs - finals[0].startMs,
  );
  const spokenMinutes = spokenDurationMs / 60_000;
  const hasRate = spokenDurationMs >= MIN_SPOKEN_MS;

  const charsPerMin =
    lang === "zh" && hasRate ? Math.round(totalChars / spokenMinutes) : null;
  const wordsPerMin =
    lang === "en" && hasRate ? Math.round(totalWords / spokenMinutes) : null;

  const { count: fillerCount, breakdown: fillerBreakdown } = countFillers(
    allText,
    lang,
  );
  const fillerPerMin = hasRate
    ? Math.round((fillerCount / spokenMinutes) * 10) / 10
    : 0;

  const plannedMs = totalDurationMs(settings);
  const rawRatio = plannedMs > 0 ? totalElapsedMs / plannedMs : 0;
  const timeAchievementRatio = Math.round(rawRatio * 1000) / 1000;
  const timeStatus: SpeechMetrics["timeStatus"] =
    timeAchievementRatio < 0.9
      ? "under"
      : timeAchievementRatio > 1.1
        ? "over"
        : "on-target";

  const longPauses = findLongPauses(finals);
  const totalPauseMs = longPauses.reduce((sum, g) => sum + g.durationMs, 0);

  return {
    lang,
    charsPerMin,
    wordsPerMin,
    totalChars,
    totalWords,
    fillerCount,
    fillerPerMin,
    fillerBreakdown,
    timeAchievementRatio,
    timeStatus,
    spokenDurationMs,
    longPauses,
    totalPauseMs,
    segmentProgress: computeSegmentProgress(finals, settings, lang),
  };
}
