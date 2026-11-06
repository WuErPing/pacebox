import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pause, Play, Volume2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { loadRecordingBlob } from "@/lib/recording-storage";
import { formatOffset } from "@/lib/timer-core";

interface AudioPlayerProps {
  /** native: file:// URI；web: "idb:<id>" */
  audioRef: string;
}

interface ResolvedAudio {
  uri: string | null;
  failed: boolean;
}

/** web 端需从 IndexedDB 取 blob 换 object URL；native 端 file:// 直接可播 */
function useResolvedAudio(audioRef: string): ResolvedAudio {
  const [state, setState] = useState<ResolvedAudio>(() =>
    Platform.OS === "web" ? { uri: null, failed: false } : { uri: audioRef, failed: false },
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void loadRecordingBlob(audioRef).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setState({ uri: null, failed: true });
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      setState({ uri: objectUrl, failed: false });
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioRef]);

  return state;
}

function Player({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  return (
    <View style={styles.playerRow}>
      <Pressable
        accessibilityLabel={status.playing ? "暂停回放" : "播放录音"}
        onPress={() => {
          if (status.playing) {
            player.pause();
          } else {
            player.play();
          }
        }}
        style={({ pressed }) => [
          styles.playButton,
          pressed && styles.playButtonPressed,
        ]}
      >
        {status.playing ? (
          <Pause color="#0F172A" size={18} fill="#0F172A" />
        ) : (
          <Play color="#0F172A" size={18} fill="#0F172A" />
        )}
      </Pressable>
      {/* webm blob 常缺 duration 元数据，只展示已播时长，不做进度条 */}
      <Text style={styles.time}>{formatOffset(status.currentTime * 1000)}</Text>
    </View>
  );
}

/** 录音回放：播放/暂停 + 已播时长 */
export function AudioPlayer({ audioRef }: AudioPlayerProps) {
  const { uri, failed } = useResolvedAudio(audioRef);

  return (
    <View style={styles.container}>
      <Volume2 color="#64748B" size={16} />
      {uri ? (
        <Player uri={uri} />
      ) : (
        <Text style={styles.hint}>
          {failed ? "录音不可用（可能已被清理）" : "录音加载中…"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  playButton: {
    backgroundColor: "#38BDF8",
    borderRadius: 999,
    padding: 10,
  },
  playButtonPressed: {
    opacity: 0.8,
  },
  time: {
    color: "#F8FAFC",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  hint: {
    color: "#94A3B8",
    fontSize: 14,
  },
});
