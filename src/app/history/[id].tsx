import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AiScoreCard } from "@/components/ai-score-card";
import { AudioPlayer } from "@/components/audio-player";
import { MetricsCard } from "@/components/metrics-card";
import { isAiConfigured } from "@/lib/ai-scoring";
import { scoreSession } from "@/lib/ai-session";
import { formatDateTime } from "@/lib/format";
import type { RehearsalSession } from "@/lib/rehearsal-types";
import { formatOffset } from "@/lib/timer-core";
import { useAiConfigStore } from "@/store/ai-config";
import { useHistoryStore } from "@/store/history";

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export default function SessionReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<RehearsalSession | null>(null);
  const [notFound, setNotFound] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const autoScoredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void useHistoryStore.getState().loadSession(id).then((loaded) => {
      if (cancelled) return;
      if (loaded) {
        setSession(loaded);
      } else {
        setNotFound(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const runScoring = useCallback(async (sessionId: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    // 乐观置 pending，立即反馈「评分中」
    setSession((prev) =>
      prev && prev.id === sessionId
        ? { ...prev, aiStatus: "pending", aiError: null }
        : prev,
    );
    const updated = await scoreSession(sessionId, controller.signal);
    if (updated && !controller.signal.aborted) setSession(updated);
  }, []);

  // 进入报告页自动评分（每次挂载至多一次；已评分不重复请求）
  useEffect(() => {
    if (!session || autoScoredRef.current) return;
    if (session.aiStatus === "done") return;
    if (!isAiConfigured(useAiConfigStore.getState().config)) return;
    autoScoredRef.current = true;
    const timer = setTimeout(() => void runScoring(session.id), 0);
    return () => clearTimeout(timer);
  }, [session, runScoring]);

  if (notFound) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>记录不存在或已被删除</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#38BDF8" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.date}>{formatDateTime(session.startedAt)}</Text>
        <Text style={styles.detail}>
          计划 {session.settings.totalMinutes} 分钟 · 实际{" "}
          {formatOffset(session.totalElapsedMs)}
        </Text>
        <View style={styles.badges}>
          <Badge
            text={session.completedNaturally ? "自然结束" : "提前结束"}
            color={session.completedNaturally ? "#34D399" : "#F59E0B"}
          />
          {!session.transcriptionSupported ? (
            <Badge text="未转写" color="#94A3B8" />
          ) : null}
        </View>
      </View>

      {session.metrics ? (
        <>
          <SectionTitle>本地指标</SectionTitle>
          <MetricsCard metrics={session.metrics} />
        </>
      ) : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            本次演练没有转写数据，仅保留计时与录音
          </Text>
        </View>
      )}

      <AiScoreCard
        aiStatus={session.aiStatus}
        aiScore={session.aiScore}
        aiError={session.aiError}
        onScore={() => void runScoring(session.id)}
        onGoSettings={() => router.push("/settings")}
      />

      {session.audioRef ? (
        <>
          <SectionTitle>录音回放</SectionTitle>
          <AudioPlayer audioRef={session.audioRef} />
        </>
      ) : null}

      <SectionTitle>完整转写</SectionTitle>
      <View style={styles.card}>
        {session.segments.length === 0 ? (
          <Text style={styles.emptyHint}>无转写内容</Text>
        ) : (
          session.segments.map((segment, i) => (
            <Text key={`${segment.startMs}-${i}`} style={styles.segment}>
              <Text style={styles.timestamp}>
                [{formatOffset(segment.startMs)}]
              </Text>{" "}
              {segment.text}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 14,
  },
  center: {
    flex: 1,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyHint: {
    color: "#64748B",
    fontSize: 14,
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  date: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  detail: {
    color: "#94A3B8",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  badges: {
    flexDirection: "row",
    gap: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  notice: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.35)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    color: "#F59E0B",
    fontSize: 13,
  },
  segment: {
    color: "#F8FAFC",
    fontSize: 15,
    lineHeight: 22,
  },
  timestamp: {
    color: "#64748B",
    fontSize: 13,
  },
});
