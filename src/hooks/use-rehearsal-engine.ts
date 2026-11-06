import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { useRecorder } from "@/hooks/use-recorder";
import { useTranscription } from "@/hooks/use-transcription";
import { ensurePermission } from "@/lib/notifier";
import { finalizeRehearsal } from "@/lib/rehearsal-finalize";
import type { RecordingSource } from "@/lib/recording-storage";
import type { TimerSettings } from "@/lib/timer-core";
import { useRehearsalStore, type RehearsalPhase } from "@/store/rehearsal";
import { useSettingsStore } from "@/store/settings";
import { useTimerStore } from "@/store/timer";

/** Android 13 (API 33) 起支持 continuous + persist 一体化录音转写 */
const MIN_CONTINUOUS_API = 33;

export interface RehearsalCapabilities {
  /** 本机支持实时转写（Android 12- 或无识别 API 为 false） */
  transcription: boolean;
  /** ESR persist 一体化（转写+录音同一麦克风会话，Android 13+/iOS） */
  recordingPersist: boolean;
}

export interface UseRehearsalEngineOptions {
  /** BCP-47 识别语言，如 "zh-CN" */
  lang: string;
}

export interface UseRehearsalEngineResult {
  capabilities: RehearsalCapabilities;
  phase: RehearsalPhase;
  micDenied: boolean;
  listening: boolean;
  recognitionError: string | null;
  recorderError: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  finish: (completedNaturally?: boolean) => Promise<void>;
}

function androidApiLevel(): number {
  if (Platform.OS !== "android") return 99;
  return Number((Platform.constants as { Version?: number }).Version ?? 99);
}

/** 能力探测全部为同步调用，可在渲染期惰性初始化 */
function probeCapabilities(): RehearsalCapabilities {
  let transcription = true;
  if (Platform.OS === "android" && androidApiLevel() < MIN_CONTINUOUS_API) {
    transcription = false;
  }
  let available = false;
  let supportsRec = false;
  try {
    available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    supportsRec = ExpoSpeechRecognitionModule.supportsRecording();
  } catch {
    available = false;
  }
  transcription = transcription && available;
  return {
    transcription,
    recordingPersist: transcription && Platform.OS !== "web" && supportsRec,
  };
}

/**
 * 演练编排：能力探测、权限、计时/转写/录音的启停与收尾。
 * 响铃与通知由页面另挂 useTimerEngine 复用。
 */
export function useRehearsalEngine({
  lang,
}: UseRehearsalEngineOptions): UseRehearsalEngineResult {
  const phase = useRehearsalStore((s) => s.phase);
  const transcriptionSupported = useRehearsalStore((s) => s.transcriptionSupported);
  const timerStatus = useTimerStore((s) => s.status);

  const recorder = useRecorder();
  const [capabilities] = useState<RehearsalCapabilities>(probeCapabilities);
  const [micGranted, setMicGranted] = useState(false);
  const [micDenied, setMicDenied] = useState(false);

  const startingRef = useRef(false);
  const unmountingRef = useRef(false);
  const settingsRef = useRef<TimerSettings | null>(null);
  /** persist 模式转写降级后补启的兜底录音是否已开 */
  const fallbackRecorderRef = useRef(false);

  // 能力探测结果同步到 store（驱动页面降级徽标）
  useEffect(() => {
    useRehearsalStore
      .getState()
      .prepare({ transcription: capabilities.transcription });
  }, [capabilities.transcription]);

  // persist 模式：暂停不停识别（保持单一音频文件）；其余模式仅 active 时识别
  const shouldRecognize =
    micGranted &&
    transcriptionSupported &&
    (capabilities.recordingPersist
      ? phase === "active" || phase === "paused"
      : phase === "active");

  const {
    listening,
    error: recognitionError,
    waitForPersistedAudio,
    resetPersistedAudio,
  } = useTranscription({
    active: shouldRecognize,
    lang,
    persistAudio: capabilities.recordingPersist,
  });

  // persist 模式转写降级（重启风暴）后，补启 expo-audio 录音兜底
  useEffect(() => {
    if (!capabilities.recordingPersist || transcriptionSupported) return;
    if (phase !== "active" && phase !== "paused") return;
    if (fallbackRecorderRef.current) return;
    fallbackRecorderRef.current = true;
    void recorder.start();
  }, [capabilities.recordingPersist, transcriptionSupported, phase, recorder]);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    const store = useRehearsalStore.getState();
    if (
      store.phase === "active" ||
      store.phase === "paused" ||
      store.phase === "finalizing"
    ) {
      return;
    }
    startingRef.current = true;
    try {
      void ensurePermission();
      resetPersistedAudio();
      fallbackRecorderRef.current = false;
      setMicDenied(false);
      settingsRef.current = useSettingsStore.getState().settings;

      let granted = false;
      if (capabilities.transcription) {
        try {
          const permission =
            await ExpoSpeechRecognitionModule.requestPermissionsAsync();
          granted = permission.granted;
        } catch {
          granted = false;
        }
      }

      if (granted) {
        store.prepare({ transcription: true });
      } else {
        // 转写不可用：降级为仅录音（录音也失败则纯配速演练）
        store.prepare({ transcription: false });
        const recorderStarted = await recorder.start();
        fallbackRecorderRef.current = recorderStarted;
        setMicDenied(!recorderStarted);
      }
      setMicGranted(granted);

      const now = Date.now();
      store.begin(now);
      const timer = useTimerStore.getState();
      timer.reset();
      timer.start(now);

      if (granted && !capabilities.recordingPersist) {
        // Web / 非 persist native：expo-audio 与识别并行录音
        const ok = await recorder.start();
        if (!ok) setMicDenied(true);
      }
    } finally {
      startingRef.current = false;
    }
  }, [capabilities, recorder, resetPersistedAudio]);

  const pause = useCallback(() => {
    const store = useRehearsalStore.getState();
    if (store.phase !== "active") return;
    store.pause();
    useTimerStore.getState().pause();
  }, []);

  const resume = useCallback(() => {
    const store = useRehearsalStore.getState();
    if (store.phase !== "paused") return;
    store.resume();
    useTimerStore.getState().start();
  }, []);

  const finish = useCallback(
    async (completedNaturally = false) => {
      const store = useRehearsalStore.getState();
      if (store.phase !== "active" && store.phase !== "paused") return;
      store.beginFinalize(); // 同步占位，防「自然到点 + 手动结束」双触发
      setMicGranted(false); // active -> false，识别在 effect 中停止

      const timer = useTimerStore.getState();
      if (timer.status === "running") timer.pause();
      const totalElapsedMs = Math.max(timer.accumulatedMs, timer.elapsedMs);
      const settings =
        settingsRef.current ?? useSettingsStore.getState().settings;

      let recording: RecordingSource | null = null;
      if (capabilities.recordingPersist && !fallbackRecorderRef.current) {
        // 识别停止后 audioend 携带 persist 文件 URI，3s 超时兜底；
        // 卸载收尾时监听器已拆除，不再等待（保留已到达的 URI）
        const uri = await waitForPersistedAudio(unmountingRef.current ? 0 : 3000);
        if (uri) recording = { uri };
      } else {
        const result = await recorder.stop();
        if (result) recording = { uri: result.uri, mime: result.mime };
      }

      try {
        const session = await finalizeRehearsal({
          startedAt: store.startedAt || Date.now(),
          settings,
          completedNaturally,
          totalElapsedMs,
          transcriptionSupported: store.transcriptionSupported,
          segments: store.segments,
          recording,
        });
        // 卸载收尾：存史即可，回到 idle（下次进入页面从零开始）；
        // 正常收尾：置 done 供页面跳转报告页
        if (unmountingRef.current) {
          store.reset();
        } else {
          store.finish(session.id);
        }
      } catch {
        // 入库失败也要退出 finalizing，避免页面卡死
        store.reset();
      }
      useTimerStore.getState().reset();
    },
    [capabilities.recordingPersist, recorder, waitForPersistedAudio],
  );

  // 计时自然到点 -> 自动收尾（延迟一拍，避免 effect 内同步 setState）
  useEffect(() => {
    if (timerStatus !== "finished" || phase !== "active") return;
    const timer = setTimeout(() => void finish(true), 0);
    return () => clearTimeout(timer);
  }, [timerStatus, phase, finish]);

  // 中途离开页面：保存已采集内容，不跳转
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    return () => {
      const current = useRehearsalStore.getState().phase;
      if (current === "active" || current === "paused") {
        unmountingRef.current = true;
        void finishRef.current(false);
      }
    };
  }, []);

  return {
    capabilities,
    phase,
    micDenied,
    listening,
    recognitionError,
    recorderError: recorder.error,
    start,
    pause,
    resume,
    finish,
  };
}
