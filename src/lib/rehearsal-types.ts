import type { ReminderId, TimerSettings } from "@/lib/timer-core";

/** 转写分段。时间全部以计时器 elapsedMs 为基准（暂停时段不计入） */
export interface TranscriptSegment {
  text: string;
  /** 该段开始时的 elapsedMs（首个 interim 到达时刻） */
  startMs: number;
  /** 该段 final 时刻的 elapsedMs */
  endMs: number;
  isFinal: boolean;
}

export type SpeechLang = "zh" | "en";

export interface SegmentProgressItem {
  reminderId: ReminderId;
  atMs: number;
  /** 到该提醒点为止已说单位数（中文字符或英文单词） */
  spokenUnits: number;
  /** 占总说话量比例 0-1 */
  spokenRatio: number;
  /** 理想比例（= 提醒点时间百分比），用于对比超前/落后 */
  expectedRatio: number;
}

export interface PauseGap {
  /** 停顿开始（前一段 endMs） */
  afterMs: number;
  durationMs: number;
}

export interface SpeechMetrics {
  lang: SpeechLang;
  /** 中文字/分钟；lang=en 时为 null */
  charsPerMin: number | null;
  /** 英文词/分钟；lang=zh 时为 null */
  wordsPerMin: number | null;
  totalChars: number;
  totalWords: number;
  fillerCount: number;
  fillerPerMin: number;
  fillerBreakdown: Record<string, number>;
  /** 实际用时 / 计划总时长 */
  timeAchievementRatio: number;
  /** ±10% 判定 */
  timeStatus: "under" | "on-target" | "over";
  /** 有效说话时长（首段 startMs → 末段 endMs） */
  spokenDurationMs: number;
  longPauses: PauseGap[];
  totalPauseMs: number;
  segmentProgress: SegmentProgressItem[];
}

export type AiDimensionKey =
  | "pace"
  | "fillers"
  | "structure"
  | "timing"
  | "content";

export interface AiScoreDimension {
  key: AiDimensionKey;
  /** 0-100 */
  score: number;
  comment: string;
}

export interface AiScore {
  total: number;
  dimensions: AiScoreDimension[];
  suggestions: string[];
  summary: string;
  model: string;
  scoredAt: number;
}

export type AiStatus = "unconfigured" | "pending" | "done" | "error";

export interface RehearsalSession {
  id: string;
  startedAt: number;
  endedAt: number;
  /** 演练时的设置快照（防止事后改设置影响历史） */
  settings: TimerSettings;
  /** true=计时自然到 end，false=提前结束 */
  completedNaturally: boolean;
  totalElapsedMs: number;
  /** Android 12- 等降级场景为 false（无转写） */
  transcriptionSupported: boolean;
  segments: TranscriptSegment[];
  metrics: SpeechMetrics | null;
  aiStatus: AiStatus;
  aiScore: AiScore | null;
  aiError: string | null;
  /** native: file:// URI；web: "idb:<id>"；null=无录音 */
  audioRef: string | null;
  audioMime: string | null;
}

/** 历史列表用的轻量条目（避免整包加载 20 份转写） */
export interface HistoryEntry {
  id: string;
  startedAt: number;
  totalMinutes: number;
  totalElapsedMs: number;
  lang: SpeechLang | null;
  /** charsPerMin ?? wordsPerMin */
  rate: number | null;
  fillerCount: number | null;
  aiStatus: AiStatus;
  aiTotal: number | null;
  hasAudio: boolean;
  /** 录音引用，用于孤儿文件清理；无录音为 null */
  audioRef: string | null;
}

export const MAX_HISTORY = 20;

/** 单条 session JSON 超过该值时截断转写文本（保 metrics），防 AsyncStorage 超限 */
export const MAX_SESSION_JSON_BYTES = 512 * 1024;

export function newSessionId(now = Date.now()): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
