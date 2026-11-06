import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useCallback, useState } from "react";
import { Platform } from "react-native";

export interface RecorderStopResult {
  uri: string;
  mime: string;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * expo-audio 独立录音：Web 全程使用（MediaRecorder→webm），
 * native 仅在 ESR persist 不可用时启用（Android 12- 降级为仅录音），
 * 与 ESR persist 模式互斥（避免原生麦克风并发冲突）。
 */
export function useRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError("未获得麦克风权限，无法录音");
        return false;
      }
      if (Platform.OS !== "web") {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          allowsRecording: true,
        });
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }, [recorder]);

  const stop = useCallback(async (): Promise<RecorderStopResult | null> => {
    try {
      if (recorder.isRecording) await recorder.stop();
      if (Platform.OS !== "web") {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          allowsRecording: false,
        });
      }
      const uri = recorder.uri;
      if (!uri) return null;
      return { uri, mime: Platform.OS === "web" ? "audio/webm" : "audio/mp4" };
    } catch (e) {
      setError(errorMessage(e));
      return null;
    }
  }, [recorder]);

  return { start, stop, error };
}
