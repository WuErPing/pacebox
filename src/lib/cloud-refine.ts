import { AiRequestError } from "@/lib/ai-scoring";
import { decodeAudioBlobToWav16k } from "@/lib/audio-decode";
import { transcribeChunk } from "@/lib/mimo-asr";
import { loadRecordingBytes } from "@/lib/recording-storage";
import type { TranscriptSegment } from "@/lib/rehearsal-types";
import {
  decodeWavToMono16k,
  encodeWav,
  splitPcmChunks,
} from "@/lib/wav";
import type { AiConfig } from "@/store/ai-config";

const CONCURRENCY = 3;

/** 墙钟暂停区间（persist 录音暂停不停，时间戳映射需扣除） */
export interface PauseRange {
  startWallMs: number;
  endWallMs: number;
}

export interface CloudRefineInput {
  /** 持久化后的录音引用与 mime */
  audio: { ref: string; mime: string } | null;
  lang: string;
  totalElapsedMs: number;
  pauseRanges: PauseRange[];
  config: AiConfig;
  onProgress?: (note: string) => void;
  signal?: AbortSignal;
}

export type CloudRefineResult =
  | { status: "skipped"; reason: string }
  | { status: "refined"; segments: TranscriptSegment[] }
  | { status: "failed"; error: string };

/** 录音墙钟偏移 → 计时器 elapsedMs（扣除暂停区间，clamp 到 [0, totalElapsedMs]） */
export function wallToElapsedMs(
  wallOffsetMs: number,
  pauseRanges: PauseRange[],
  totalElapsedMs: number,
): number {
  let paused = 0;
  for (const range of pauseRanges) {
    if (range.startWallMs >= wallOffsetMs) continue;
    paused += Math.min(wallOffsetMs, range.endWallMs) - range.startWallMs;
  }
  return Math.max(0, Math.min(totalElapsedMs, wallOffsetMs - paused));
}

/**
 * 云端精校：录音 → 16k mono WAV → 3 分钟分片并发上送 MiMo ASR →
 * 片边界组装带时间戳的 segments。任一片失败整体回退本地（不做半云半本地拼接）。
 */
export async function refineTranscription(
  input: CloudRefineInput,
): Promise<CloudRefineResult> {
  const { audio, lang, totalElapsedMs, pauseRanges, config, onProgress, signal } = input;
  if (!audio) return { status: "skipped", reason: "无录音" };
  if (!config.asrModel || !config.baseUrl.trim() || !config.apiKey.trim()) {
    return { status: "skipped", reason: "未开启云端精校" };
  }
  // Android 12- 兜底录音 m4a / 异常 caf：MiMo 仅收 wav/mp3
  if (audio.mime === "audio/mp4" || audio.mime === "audio/x-caf") {
    return { status: "skipped", reason: "当前录音格式不支持云端精校" };
  }

  const bytes = await loadRecordingBytes(audio.ref);
  if (!bytes || bytes.length === 0) {
    return { status: "skipped", reason: "录音读取失败" };
  }

  let samples: Int16Array;
  if (audio.mime === "audio/wav") {
    try {
      samples = decodeWavToMono16k(bytes);
    } catch (e) {
      return {
        status: "failed",
        error: e instanceof Error ? e.message : "录音解析失败",
      };
    }
  } else {
    // Web webm 等：浏览器解码重采样为 16k WAV
    try {
      const wav = await decodeAudioBlobToWav16k(
        new Blob([bytes.buffer as ArrayBuffer], { type: audio.mime }),
      );
      samples = decodeWavToMono16k(wav);
    } catch {
      return { status: "skipped", reason: "浏览器无法解码录音" };
    }
  }
  if (samples.length === 0) return { status: "skipped", reason: "录音为空" };

  const chunks = splitPcmChunks(samples);
  const texts: string[] = new Array(chunks.length).fill("");
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  let next = 0;
  let done = 0;
  let failure: unknown = null;
  onProgress?.(`云端精校中（0/${chunks.length}）…`);

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= chunks.length || failure) return;
      try {
        texts[i] = await transcribeChunk(
          config,
          encodeWav(chunks[i].samples),
          lang,
          controller.signal,
        );
        done += 1;
        onProgress?.(`云端精校中（${done}/${chunks.length}）…`);
      } catch (e) {
        if (!failure) {
          failure = e;
          controller.abort();
        }
        return;
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => worker()),
    );
  } finally {
    signal?.removeEventListener("abort", onExternalAbort);
  }

  if (failure) {
    return {
      status: "failed",
      error:
        failure instanceof AiRequestError
          ? failure.message
          : "云端精校失败，请重试",
    };
  }

  const segments: TranscriptSegment[] = [];
  chunks.forEach((chunk, i) => {
    const text = texts[i].trim();
    if (!text) return;
    segments.push({
      text,
      startMs: wallToElapsedMs(chunk.offsetMs, pauseRanges, totalElapsedMs),
      endMs: wallToElapsedMs(
        chunk.offsetMs + chunk.durationMs,
        pauseRanges,
        totalElapsedMs,
      ),
      isFinal: true,
    });
  });
  if (segments.length === 0) {
    return { status: "failed", error: "云端未识别到内容" };
  }
  return { status: "refined", segments };
}