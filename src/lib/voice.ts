import * as Speech from "expo-speech";

import { currentLanguage, type Language } from "@/lib/messages";

const SPEECH_LANGUAGE: Record<Language, string> = {
  zh: "zh-CN",
  en: "en-US",
};

/** 播放一句简洁语音提示；TTS 不可用时静默降级 */
export function speak(text: string): void {
  try {
    Speech.speak(text, {
      language: SPEECH_LANGUAGE[currentLanguage()],
    });
  } catch {
    // 忽略 TTS 不可用
  }
}
