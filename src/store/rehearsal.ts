import { create } from "zustand";

import type { TranscriptSegment } from "@/lib/rehearsal-types";

export type RehearsalPhase =
  | "idle"
  | "active"
  | "paused"
  | "finalizing"
  | "done";

interface RehearsalState {
  phase: RehearsalPhase;
  segments: TranscriptSegment[];
  /** 当前未定稿的中间结果（实时刷新，final 后清空） */
  interimText: string;
  /** 当前段首个 interim 到达时刻（elapsedMs 基准），无 interim 时为 null */
  interimStartMs: number | null;
  /** 能力探测结果：本机是否支持转写（Android 12- 为 false） */
  transcriptionSupported: boolean;
  listening: boolean;
  recognitionError: string | null;
  startedAt: number;
  /** 最近一次完成的 session id，用于跳转报告页 */
  lastSessionId: string | null;

  prepare: (opts: { transcription: boolean }) => void;
  begin: (now?: number) => void;
  pause: () => void;
  resume: () => void;
  pushInterim: (text: string, elapsedMs: number) => void;
  pushFinal: (text: string, elapsedMs: number) => void;
  setListening: (listening: boolean) => void;
  setRecognitionError: (error: string | null) => void;
  /** 同步进入 finalizing，防「自然到点 + 手动结束」双触发 */
  beginFinalize: () => void;
  finish: (sessionId: string) => void;
  reset: () => void;
}

const INITIAL = {
  phase: "idle" as RehearsalPhase,
  segments: [] as TranscriptSegment[],
  interimText: "",
  interimStartMs: null,
  listening: false,
  recognitionError: null,
  startedAt: 0,
  lastSessionId: null,
};

export const useRehearsalStore = create<RehearsalState>((set, get) => ({
  ...INITIAL,
  transcriptionSupported: true,

  prepare: ({ transcription }) => {
    set({ transcriptionSupported: transcription });
  },

  begin: (now = Date.now()) => {
    set({
      ...INITIAL,
      phase: "active",
      startedAt: now,
      transcriptionSupported: get().transcriptionSupported,
    });
  },

  pause: () => {
    if (get().phase !== "active") return;
    // 暂停丢弃未定稿的中间结果（恢复后重新开始该段）
    set({ phase: "paused", interimText: "", interimStartMs: null });
  },

  resume: () => {
    if (get().phase !== "paused") return;
    set({ phase: "active" });
  },

  pushInterim: (text, elapsedMs) => {
    const { phase, interimStartMs } = get();
    if (phase !== "active" || !text) return;
    set({ interimText: text, interimStartMs: interimStartMs ?? elapsedMs });
  },

  pushFinal: (text, elapsedMs) => {
    const { phase, interimStartMs, segments } = get();
    // persist 模式暂停时识别仍在运行，final 照常入库
    if (phase !== "active" && phase !== "paused") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const segment: TranscriptSegment = {
      text: trimmed,
      startMs: interimStartMs ?? elapsedMs,
      endMs: elapsedMs,
      isFinal: true,
    };
    set({
      segments: [...segments, segment],
      interimText: "",
      interimStartMs: null,
    });
  },

  setListening: (listening) => {
    set({ listening });
  },

  setRecognitionError: (recognitionError) => {
    set({ recognitionError });
  },

  beginFinalize: () => {
    const { phase } = get();
    if (phase !== "active" && phase !== "paused") return;
    set({ phase: "finalizing", interimText: "", interimStartMs: null });
  },

  finish: (sessionId) => {
    set({ phase: "done", lastSessionId: sessionId, listening: false });
  },

  reset: () => {
    set({ ...INITIAL, transcriptionSupported: get().transcriptionSupported });
  },
}));
