import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";

// 由 scripts/generate-bell.mjs 生成
const bellSource = require("../../assets/sounds/bell.wav") as number;

let player: AudioPlayer | null = null;

/** 在用户手势内创建播放器（Web 自动播放策略要求） */
export function primeBell(): void {
  if (player) return;
  try {
    player = createAudioPlayer(bellSource);
  } catch {
    player = null;
  }
}

export async function ringBell(): Promise<void> {
  primeBell();
  if (!player) return;
  try {
    await player.seekTo(0);
    player.play();
  } catch {
    // 忽略播放失败（例如 Web 端尚未有用户手势）
  }
}

/** 允许在静音模式/后台播放（原生端） */
export async function configureAudio(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });
  } catch {
    // 忽略音频配置失败
  }
}
