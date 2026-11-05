import { useRouter } from "expo-router";
import {
  Bell,
  BellRing,
  Flag,
  Pause,
  Play,
  RotateCcw,
  Settings as SettingsIcon,
} from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTimerEngine } from "@/hooks/use-timer-engine";
import { primeBell } from "@/lib/bell";
import { ensurePermission } from "@/lib/notifier";
import {
  formatClock,
  formatOffset,
  reminderPoints,
  totalDurationMs,
  type ReminderId,
} from "@/lib/timer-core";
import { useSettingsStore } from "@/store/settings";
import { useTimerStore } from "@/store/timer";

const REMINDER_LABEL: Record<ReminderId, string> = {
  first: "第一次提醒",
  second: "第二次提醒",
  end: "结束",
};

export default function TimerScreen() {
  useTimerEngine();
  const router = useRouter();

  const settings = useSettingsStore((s) => s.settings);
  const status = useTimerStore((s) => s.status);
  const elapsedMs = useTimerStore((s) => s.elapsedMs);
  const fired = useTimerStore((s) => s.fired);

  const totalMs = totalDurationMs(settings);
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const points = useMemo(() => reminderPoints(settings), [settings]);
  const progress = totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 0;

  const handlePrimary = () => {
    // 用户手势内初始化铃声与通知权限（Web 自动播放/通知策略要求）
    primeBell();
    void ensurePermission();
    const store = useTimerStore.getState();
    if (store.status === "running") {
      store.pause();
    } else {
      store.start();
    }
  };

  const primaryLabel =
    status === "running"
      ? "暂停"
      : status === "paused"
        ? "继续"
        : status === "finished"
          ? "再来一轮"
          : "开始";
  const PrimaryIcon = status === "running" ? Pause : Play;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>Pacebox</Text>
          <Pressable
            accessibilityLabel="设置"
            onPress={() => router.push("/settings")}
            style={styles.iconButton}
          >
            <SettingsIcon color="#94A3B8" size={22} />
          </Pressable>
        </View>

        <View style={styles.clockArea}>
          <Text style={styles.clock}>{formatClock(remainingMs)}</Text>
          <Text style={styles.statusText}>
            {status === "finished"
              ? "时间到"
              : status === "running"
                ? "计时中"
                : status === "paused"
                  ? "已暂停"
                  : `总时长 ${settings.totalMinutes} 分钟，按「开始」立即开始`}
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>

          <View style={styles.marks}>
            {points.map((point) => {
              const isFired = fired.includes(point.id);
              const Icon =
                point.id === "end" ? Flag : isFired ? BellRing : Bell;
              return (
                <View key={point.id} style={styles.mark}>
                  <Icon color={isFired ? "#38BDF8" : "#64748B"} size={16} />
                  <Text style={[styles.markText, isFired && styles.markTextFired]}>
                    {REMINDER_LABEL[point.id]} {formatOffset(point.atMs)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable
            accessibilityLabel={primaryLabel}
            onPress={handlePrimary}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <PrimaryIcon color="#0F172A" size={20} fill="#0F172A" />
            <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
          </Pressable>
          {status !== "idle" && (
            <Pressable
              accessibilityLabel="重置"
              onPress={() => useTimerStore.getState().reset()}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <RotateCcw color="#F8FAFC" size={18} />
              <Text style={styles.secondaryButtonText}>重置</Text>
            </Pressable>
          )}
        </View>
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
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
  },
  iconButton: {
    padding: 8,
  },
  clockArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  clock: {
    color: "#F8FAFC",
    fontSize: 88,
    fontWeight: "200",
    fontVariant: ["tabular-nums"],
  },
  statusText: {
    color: "#94A3B8",
    fontSize: 15,
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
    gap: 10,
    alignSelf: "stretch",
  },
  mark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  markText: {
    color: "#64748B",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  markTextFired: {
    color: "#38BDF8",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 24,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#38BDF8",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderColor: "#334155",
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryButtonText: {
    color: "#F8FAFC",
    fontSize: 15,
  },
});
