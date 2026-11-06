import { useRouter } from "expo-router";
import { MicOff, Trash2, Volume2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatDateTime } from "@/lib/format";
import type { HistoryEntry } from "@/lib/rehearsal-types";
import { formatOffset } from "@/lib/timer-core";
import { useHistoryStore } from "@/store/history";

function scoreColor(score: number): string {
  if (score >= 80) return "#34D399";
  if (score >= 60) return "#F59E0B";
  return "#F87171";
}

function AiBadge({ entry }: { entry: HistoryEntry }) {
  switch (entry.aiStatus) {
    case "done":
      return (
        <View style={[styles.aiBadge, { borderColor: scoreColor(entry.aiTotal ?? 0) }]}>
          <Text style={[styles.aiBadgeText, { color: scoreColor(entry.aiTotal ?? 0) }]}>
            AI {entry.aiTotal ?? "—"}
          </Text>
        </View>
      );
    case "pending":
      return (
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>评分中</Text>
        </View>
      );
    case "error":
      return (
        <View style={[styles.aiBadge, { borderColor: "#F87171" }]}>
          <Text style={[styles.aiBadgeText, { color: "#F87171" }]}>
            评分失败
          </Text>
        </View>
      );
    case "unconfigured":
      return (
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>未评分</Text>
        </View>
      );
  }
}

function entrySummary(entry: HistoryEntry): string {
  const parts: string[] = [];
  if (entry.rate != null && entry.lang) {
    parts.push(`${entry.rate} ${entry.lang === "en" ? "词/分" : "字/分"}`);
  }
  if (entry.fillerCount != null) {
    parts.push(`填充词 ${entry.fillerCount}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "无转写数据";
}

export default function HistoryScreen() {
  const router = useRouter();
  const entries = useHistoryStore((s) => s.entries);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setConfirmingId(null);
    void useHistoryStore.getState().removeSession(id);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <MicOff color="#64748B" size={36} />
          <Text style={styles.emptyTitle}>还没有演练记录</Text>
          <Text style={styles.emptyHint}>
            从首页进入「演练模式」，完成第一次带转写与评分的练习
          </Text>
        </View>
      ) : (
        entries.map((entry) => (
          <View key={entry.id}>
            <Pressable
              accessibilityLabel={`查看 ${formatDateTime(entry.startedAt)} 的演练报告`}
              onPress={() => router.push(`/history/${entry.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowMain}>
                <View style={styles.rowTop}>
                  <Text style={styles.date}>
                    {formatDateTime(entry.startedAt)}
                  </Text>
                  <View style={styles.rowBadges}>
                    {entry.hasAudio ? (
                      <Volume2 color="#64748B" size={15} />
                    ) : null}
                    <AiBadge entry={entry} />
                  </View>
                </View>
                <Text style={styles.detail}>
                  计划 {entry.totalMinutes} 分钟 · 实际{" "}
                  {formatOffset(entry.totalElapsedMs)}
                </Text>
                <Text style={styles.metrics}>{entrySummary(entry)}</Text>
              </View>
              {confirmingId === entry.id ? (
                <View style={styles.confirm}>
                  <Pressable
                    accessibilityLabel="确认删除"
                    onPress={() => handleDelete(entry.id)}
                    style={styles.confirmDelete}
                  >
                    <Text style={styles.confirmDeleteText}>删除</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="取消删除"
                    onPress={() => setConfirmingId(null)}
                    style={styles.confirmCancel}
                  >
                    <Text style={styles.confirmCancelText}>取消</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityLabel="删除记录"
                  onPress={() => setConfirmingId(entry.id)}
                  style={styles.trashButton}
                >
                  <Trash2 color="#64748B" size={17} />
                </Pressable>
              )}
            </Pressable>
          </View>
        ))
      )}
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
    paddingBottom: 40,
    gap: 10,
  },
  empty: {
    alignItems: "center",
    gap: 10,
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "600",
  },
  emptyHint: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  date: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  rowBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiBadge: {
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  aiBadgeText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  detail: {
    color: "#94A3B8",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  metrics: {
    color: "#64748B",
    fontSize: 12,
  },
  trashButton: {
    padding: 8,
  },
  confirm: {
    flexDirection: "row",
    gap: 6,
  },
  confirmDelete: {
    backgroundColor: "#F87171",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  confirmDeleteText: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "700",
  },
  confirmCancel: {
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  confirmCancelText: {
    color: "#94A3B8",
    fontSize: 13,
  },
});
