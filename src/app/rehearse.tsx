import { Href, useRouter } from "expo-router";
import {
  AlertTriangle,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  Square,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { TranscriptLive } from "@/components/transcript-live";
import { useRehearsalEngine } from "@/hooks/use-rehearsal-engine";
import { useTimerEngine } from "@/hooks/use-timer-engine";
import {
  formatClock,
  formatOffset,
  reminderPoints,
  totalDurationMs,
} from "@/lib/timer-core";
import { useRehearsalStore } from "@/store/rehearsal";
import { useSettingsStore } from "@/store/settings";
import { useTimerStore } from "@/store/timer";

const LANGS = [
  { value: "zh-CN", label: "中文" },
  { value: "en-US", label: "English" },
] as const;

export default function RehearseScreen() {
  useTimerEngine();
  const router = useRouter();
  const [lang, setLang] = useState<string>("zh-CN");

  const engine = useRehearsalEngine({ lang });
  const { phase, capabilities, micDenied, listening, recognitionError } = engine;

  const settings = useSettingsStore((s) => s.settings);
  const elapsedMs = useTimerStore((s) => s.elapsedMs);
  const fired = useTimerStore((s) => s.fired);
  const segments = useRehearsalStore((s) => s.segments);
  const interimText = useRehearsalStore((s) => s.interimText);
  const transcriptionSupported = useRehearsalStore((s) => s.transcriptionSupported);
  const lastSessionId = useRehearsalStore((s) => s.lastSessionId);

  const totalMs = totalDurationMs(settings);
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const points = useMemo(() => reminderPoints(settings), [settings]);
  const progress = totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 0;

  // 完成后跳转报告页
  const didResetRef = useRef(false);
  useEffect(() => {
    // 进入页面时若残留上一轮的 done，清理为全新一轮，避免立即误跳历史
    if (!didResetRef.current) {
      didResetRef.current = true;
      if (useRehearsalStore.getState().phase === "done") {
        useRehearsalStore.getState().reset();
        return;
      }
    }
    if (phase === "done" && lastSessionId) {
      router.replace(`/history/${lastSessionId}` as Href);
    }
  }, [phase, lastSessionId, router]);

  const handleFinish = () => {
    if (phase === "finalizing" || phase === "done") return;
    void engine.finish(false);
  };

  const isIdle = phase === "idle";
  const badge = !transcriptionSupported
    ? { text: "仅录音", color: "#F59E0B" }
    : phase === "active"
      ? listening
        ? { text: "转写中", color: "#38BDF8" }
        : { text: "启动中…", color: "#94A3B8" }
      : phase === "paused"
        ? { text: "已暂停", color: "#94A3B8" }
        : { text: "准备就绪", color: "#94A3B8" };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.statusRow}>
          <View style={styles.badge}>
            {listening ? (
              <Radio color={badge.color} size={14} />
            ) : (
              <Mic color={badge.color} size={14} />
            )}
            <Text style={[styles.badgeText, { color: badge.color }]}>
              {badge.text}
            </Text>
          </View>
          <View style={styles.langToggle}>
            {LANGS.map((item) => (
              <Pressable
                key={item.value}
                accessibilityLabel={`识别语言 ${item.label}`}
                disabled={!isIdle}
                onPress={() => setLang(item.value)}
                style={[
                  styles.langChip,
                  lang === item.value && styles.langChipActive,
                  !isIdle && styles.langChipDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.langChipText,
                    lang === item.value && styles.langChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.clockArea}>
          <Text style={styles.clock}>{formatClock(remainingMs)}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${progress * 100}%` }]}
            />
          </View>
          <View style={styles.marks}>
            {points.map((point) => {
              const isFired = fired.includes(point.id);
              return (
                <Text
                  key={point.id}
                  style={[styles.markText, isFired && styles.markTextFired]}
                >
                  {formatOffset(point.atMs)}
                </Text>
              );
            })}
          </View>
        </View>

        {micDenied ? (
          <View style={styles.banner}>
            <MicOff color="#F59E0B" size={16} />
            <Text style={styles.bannerText}>
              未获得麦克风权限，本次演练仅计时
            </Text>
          </View>
        ) : recognitionError ? (
          <View style={styles.banner}>
            <AlertTriangle color="#F59E0B" size={16} />
            <Text style={styles.bannerText}>{recognitionError}</Text>
          </View>
        ) : !capabilities.transcription ? (
          <View style={styles.banner}>
            <AlertTriangle color="#F59E0B" size={16} />
            <Text style={styles.bannerText}>
              当前设备不支持实时转写，将仅录音与计时
            </Text>
          </View>
        ) : null}

        <TranscriptLive segments={segments} interimText={interimText} />

        <View style={styles.controls}>
          {isIdle ? (
            <Pressable
              accessibilityLabel="开始演练"
              onPress={() => void engine.start()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Mic color="#0F172A" size={20} />
              <Text style={styles.primaryButtonText}>开始演练</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                accessibilityLabel={phase === "paused" ? "继续" : "暂停"}
                disabled={phase === "finalizing" || phase === "done"}
                onPress={() =>
                  phase === "paused" ? engine.resume() : engine.pause()
                }
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                {phase === "paused" ? (
                  <Play color="#F8FAFC" size={18} />
                ) : (
                  <Pause color="#F8FAFC" size={18} />
                )}
                <Text style={styles.secondaryButtonText}>
                  {phase === "paused" ? "继续" : "暂停"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="结束演练"
                disabled={phase === "finalizing" || phase === "done"}
                onPress={handleFinish}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Square color="#0F172A" size={18} fill="#0F172A" />
                <Text style={styles.primaryButtonText}>结束演练</Text>
              </Pressable>
            </>
          )}
        </View>

        {phase === "finalizing" ? (
          <View style={styles.overlay}>
            <ActivityIndicator color="#38BDF8" size="large" />
            <Text style={styles.overlayText}>生成报告中…</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    alignItems: "center",
  },
  inner: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 20,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  langToggle: {
    flexDirection: "row",
    gap: 6,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderColor: "#334155",
    borderWidth: 1,
  },
  langChipActive: {
    borderColor: "#38BDF8",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  langChipDisabled: {
    opacity: 0.4,
  },
  langChipText: {
    color: "#94A3B8",
    fontSize: 13,
  },
  langChipTextActive: {
    color: "#38BDF8",
    fontWeight: "600",
  },
  clockArea: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  clock: {
    color: "#F8FAFC",
    fontSize: 56,
    fontWeight: "200",
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1E293B",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#38BDF8",
  },
  marks: {
    flexDirection: "row",
    gap: 20,
  },
  markText: {
    color: "#64748B",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  markTextFired: {
    color: "#38BDF8",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.35)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  bannerText: {
    color: "#F59E0B",
    fontSize: 13,
    flex: 1,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 16,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#38BDF8",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
  },
  primaryButtonText: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderColor: "#334155",
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
  },
  secondaryButtonText: {
    color: "#F8FAFC",
    fontSize: 15,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    zIndex: 10,
  },
  overlayText: {
    color: "#F8FAFC",
    fontSize: 16,
  },
});
