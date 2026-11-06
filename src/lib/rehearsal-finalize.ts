import { isAiConfigured } from "@/lib/ai-scoring";
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
}

/** 录音持久化 → 组装 session → 写入历史，返回完整 session */
export async function finalizeRehearsal(
  input: FinalizeInput,
): Promise<RehearsalSession> {
  const id = newSessionId(input.startedAt);
  const audio = await persistRecording(id, input.recording);
  const aiConfigured = isAiConfigured(useAiConfigStore.getState().config);
  const session = buildSession({
    id,
    startedAt: input.startedAt,
    endedAt: Date.now(),
    settings: input.settings,
    completedNaturally: input.completedNaturally,
    totalElapsedMs: input.totalElapsedMs,
    transcriptionSupported: input.transcriptionSupported,
    segments: input.segments,
    aiConfigured,
    audio,
  });
  await useHistoryStore.getState().addSession(session);
  return session;
}
