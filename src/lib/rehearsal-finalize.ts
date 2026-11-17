import { isAiConfigured } from "@/lib/ai-scoring";
import {
  refineTranscription,
  type PauseRange,
} from "@/lib/cloud-refine";
import type {
  RehearsalSession,
  TranscriptSegment,
} from "@/lib/rehearsal-types";
import { newSessionId } from "@/lib/rehearsal-types";
import {
  persistRecording,
  type RecordingSource,
} from "@/lib/recording-storage";
import { computeSpeechMetrics } from "@/lib/speech-metrics";
import type { TimerSettings } from "@/lib/timer-core";
import { useAiConfigStore } from "@/store/ai-config";
import { useHistoryStore } from "@/store/history";

export interface BuildSessionInput {
  id: string;
  startedAt: number;
  endedAt: number;
  settings: TimerSettings;
  completedNaturally: boolean;
  totalElapsedMs: number;
  transcriptionSupported: boolean;
  segments: TranscriptSegment[];
  aiConfigured: boolean;
  audio: { ref: string; mime: string } | null;
  transcriptSource?: "local" | "mimo";
  refineError?: string | null;
}

/** 纯函数：组装完整 session（指标计算 + AI 状态初判） */
export function buildSession(input: BuildSessionInput): RehearsalSession {
  const metrics = computeSpeechMetrics({
    segments: input.segments,
    settings: input.settings,
    totalElapsedMs: input.totalElapsedMs,
  });
  return {
    id: input.id,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    settings: input.settings,
    completedNaturally: input.completedNaturally,
    totalElapsedMs: input.totalElapsedMs,
    transcriptionSupported: input.transcriptionSupported,
    segments: input.segments,
    transcriptSource: input.transcriptSource ?? "local",
    refineError: input.refineError ?? null,
    metrics,
    aiStatus: input.aiConfigured ? "pending" : "unconfigured",
    aiScore: null,
    aiError: null,
    audioRef: input.audio?.ref ?? null,
    audioMime: input.audio?.mime ?? null,
  };
}

export interface FinalizeInput {
  startedAt: number;
  settings: TimerSettings;
  completedNaturally: boolean;
  totalElapsedMs: number;
  transcriptionSupported: boolean;
  segments: TranscriptSegment[];
  /** ESR persist 或 expo-audio 的产物；null 表示无录音 */
  recording: RecordingSource | null;
  /** 识别语言（BCP-47），云端精校用 */
  lang?: string;
  /** 相对演练开始的墙钟暂停区间（录音暂停不停，时间戳映射需扣除） */
  pauseRanges?: PauseRange[];
  onRefineProgress?: (note: string) => void;
  /** 卸载收尾等场景跳过精校，避免悬挂长网络请求 */
  skipRefine?: boolean;
}

/** 录音持久化 → 云端精校（可选）→ 组装 session → 写入历史，返回完整 session */
export async function finalizeRehearsal(
  input: FinalizeInput,
): Promise<RehearsalSession> {
  const id = newSessionId(input.startedAt);
  const audio = await persistRecording(id, input.recording);
  const config = useAiConfigStore.getState().config;
  const aiConfigured = isAiConfigured(config);

  let segments = input.segments;
  let transcriptSource: "local" | "mimo" = "local";
  let refineError: string | null = null;
  if (!input.skipRefine) {
    try {
      const refined = await refineTranscription({
        audio,
        lang: input.lang ?? "zh-CN",
        totalElapsedMs: input.totalElapsedMs,
        pauseRanges: input.pauseRanges ?? [],
        config,
        onProgress: input.onRefineProgress,
      });
      if (refined.status === "refined") {
        segments = refined.segments;
        transcriptSource = "mimo";
      } else if (refined.status === "failed") {
        refineError = refined.error;
      }
    } catch {
      // 精校异常绝不阻断入库
      refineError = "云端精校失败，请重试";
    }
  }

  const session = buildSession({
    id,
    startedAt: input.startedAt,
    endedAt: Date.now(),
    settings: input.settings,
    completedNaturally: input.completedNaturally,
    totalElapsedMs: input.totalElapsedMs,
    transcriptionSupported: input.transcriptionSupported,
    segments,
    aiConfigured,
    audio,
    transcriptSource,
    refineError,
  });
  await useHistoryStore.getState().addSession(session);
  return session;
}
