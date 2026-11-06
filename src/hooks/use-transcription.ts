import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useCallback, useEffect, useRef } from "react";

import { useRehearsalStore } from "@/store/rehearsal";
import { useTimerStore } from "@/store/timer";

const MAX_RESTARTS = 5;
const RESTART_BASE_MS = 300;
const RESTART_MAX_MS = 3000;
/** 静音/主动中止类错误：不提示用户，由 end 事件走重启逻辑 */
const SILENT_ERROR_CODES = new Set(["no-speech", "speech-timeout", "aborted"]);

export interface UseTranscriptionOptions {
  /** 是否应处于识别状态（由引擎按权限+能力+persist 策略统一计算） */
  active: boolean;
  /** BCP-47，如 "zh-CN" / "en-US" */
  lang: string;
  /** native 端由 ESR 一并录音（Android 13+/iOS persist 模式） */
  persistAudio: boolean;
}

export interface UseTranscriptionResult {
  listening: boolean;
  error: string | null;
  /** persist 模式下等待 audioend 的录音 URI，超时返回 null */
  waitForPersistedAudio: (timeoutMs?: number) => Promise<string | null>;
  /** 新一轮开始前清空上一轮的等待结果 */
  resetPersistedAudio: () => void;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 语音转写生命周期：结果写入 rehearsal store（时间取计时器 elapsedMs），
 * Web 端静音 onend 走指数退避自动重启，连续失败超限则降级为仅录音。
 */
export function useTranscription({
  active,
  lang,
  persistAudio,
}: UseTranscriptionOptions): UseTranscriptionResult {
  const listening = useRehearsalStore((s) => s.listening);
  const error = useRehearsalStore((s) => s.recognitionError);

  const activeRef = useRef(active);
  const optsRef = useRef({ lang, persistAudio });
  const restartRef = useRef({
    attempts: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const persistedUriRef = useRef<string | null>(null);
  const audioWaitersRef = useRef<((uri: string | null) => void)[]>([]);

  // 每次渲染后同步最新参数，供 startRecognition 与重启定时器读取
  useEffect(() => {
    optsRef.current = { lang, persistAudio };
  });

  const clearRestartTimer = useCallback(() => {
    if (restartRef.current.timer != null) {
      clearTimeout(restartRef.current.timer);
      restartRef.current.timer = null;
    }
  }, []);

  const startRecognition = useCallback(() => {
    const store = useRehearsalStore.getState();
    const { lang: langOpt, persistAudio: persist } = optsRef.current;
    try {
      ExpoSpeechRecognitionModule.start({
        lang: langOpt,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        ...(persist ? { recordingOptions: { persist: true } } : {}),
      });
      store.setListening(true);
      store.setRecognitionError(null);
    } catch (e) {
      store.setListening(false);
      store.setRecognitionError(errorMessage(e));
    }
  }, []);

  const scheduleRestart = useCallback(() => {
    if (!activeRef.current) return;
    const store = useRehearsalStore.getState();
    const { attempts } = restartRef.current;
    if (attempts >= MAX_RESTARTS) {
      // 重启风暴保护：放弃转写，降级为仅录音
      store.setListening(false);
      store.prepare({ transcription: false });
      store.setRecognitionError("语音识别多次中断，已降级为仅录音");
      return;
    }
    const delay = Math.min(RESTART_BASE_MS * 2 ** attempts, RESTART_MAX_MS);
    restartRef.current.attempts = attempts + 1;
    clearRestartTimer();
    restartRef.current.timer = setTimeout(() => {
      restartRef.current.timer = null;
      if (activeRef.current) startRecognition();
    }, delay);
  }, [clearRestartTimer, startRecognition]);

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (!transcript) return;
    restartRef.current.attempts = 0;
    const elapsedMs = useTimerStore.getState().elapsedMs;
    const store = useRehearsalStore.getState();
    if (event.isFinal) {
      store.pushFinal(transcript, elapsedMs);
    } else {
      store.pushInterim(transcript, elapsedMs);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (SILENT_ERROR_CODES.has(event.error)) return;
    useRehearsalStore
      .getState()
      .setRecognitionError(event.message || event.error);
  });

  useSpeechRecognitionEvent("end", () => {
    useRehearsalStore.getState().setListening(false);
    scheduleRestart();
  });

  useSpeechRecognitionEvent("audioend", (event) => {
    persistedUriRef.current = event.uri;
    const waiters = audioWaitersRef.current;
    audioWaitersRef.current = [];
    for (const resolve of waiters) resolve(event.uri);
  });

  useEffect(() => {
    activeRef.current = active;
    if (active) {
      restartRef.current.attempts = 0;
      startRecognition();
      return;
    }
    clearRestartTimer();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // 未在识别中时 stop 可能抛错，忽略
    }
    useRehearsalStore.getState().setListening(false);
  }, [active, clearRestartTimer, startRecognition]);

  const waitForPersistedAudio = useCallback(
    (timeoutMs = 3000): Promise<string | null> => {
      if (persistedUriRef.current) return Promise.resolve(persistedUriRef.current);
      return new Promise<string | null>((resolve) => {
        let timer: ReturnType<typeof setTimeout>;
        const waiter = (uri: string | null) => {
          clearTimeout(timer);
          resolve(uri);
        };
        timer = setTimeout(() => {
          audioWaitersRef.current = audioWaitersRef.current.filter(
            (w) => w !== waiter,
          );
          resolve(null);
        }, timeoutMs);
        audioWaitersRef.current.push(waiter);
      });
    },
    [],
  );

  const resetPersistedAudio = useCallback(() => {
    persistedUriRef.current = null;
  }, []);

  return { listening, error, waitForPersistedAudio, resetPersistedAudio };
}
