import { Sparkles } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { isAiConfigured } from "@/lib/ai-scoring";
import { formatDateTime } from "@/lib/format";
import type { AiDimensionKey, AiScore, AiStatus } from "@/lib/rehearsal-types";
import { useAiConfigStore } from "@/store/ai-config";

const DIMENSION_LABEL: Record<AiDimensionKey, string> = {
  pace: "语速节奏",
  fillers: "填充词控制",
  structure: "结构推进",
  timing: "时间掌控",
  content: "内容质量",
};

function scoreColor(score: number): string {
  if (score >= 80) return "#34D399";
  if (score >= 60) return "#F59E0B";
  return "#F87171";
}

interface AiScoreCardProps {
  aiStatus: AiStatus;
  aiScore: AiScore | null;
  aiError: string | null;
  /** 重试 / 配置后开始评分 */
  onScore: () => void;
  /** 跳转设置页配置 AI */
  onGoSettings: () => void;
}

/** AI 评分区块：按状态渲染 未配置/评分中/评分结果/失败重试 */
export function AiScoreCard({
  aiStatus,
  aiScore,
  aiError,
  onScore,
  onGoSettings,
}: AiScoreCardProps) {
  // 实时读取配置：设置页配置后返回本页（未重挂载）也能立即评分
  const configured = useAiConfigStore((s) => isAiConfigured(s.config));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Sparkles color="#38BDF8" size={16} />
        <Text style={styles.headerTitle}>AI 评分</Text>
        {aiStatus === "done" && aiScore ? (
          <Text style={styles.headerMeta}>{aiScore.model}</Text>
        ) : null}
      </View>

      {aiStatus === "pending" ? (
        <View style={styles.pending}>
          <ActivityIndicator color="#38BDF8" />
          <Text style={styles.pendingText}>AI 评分中…</Text>
        </View>
      ) : null}

      {aiStatus === "unconfigured" ? (
        <View style={styles.body}>
          <Text style={styles.hint}>
            {configured
              ? "AI 已配置，可对本次演练评分"
              : "配置 OpenAI 兼容接口后，可获得总分、五维点评与改进建议。API Key 仅保存在本机。"}
          </Text>
          <View style={styles.actions}>
            {configured ? (
              <Pressable
                accessibilityLabel="开始评分"
                onPress={onScore}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>开始评分</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel="前往设置"
                onPress={onGoSettings}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>前往设置</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}

      {aiStatus === "error" ? (
        <View style={styles.body}>
          <Text style={styles.errorText}>{aiError ?? "评分失败，请重试"}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel="重试评分"
              onPress={onScore}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>重试</Text>
            </Pressable>
            {!configured ? (
              <Pressable
                accessibilityLabel="检查 AI 设置"
                onPress={onGoSettings}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>检查设置</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {aiStatus === "done" && aiScore ? (
        <View style={styles.body}>
          <View style={styles.totalRow}>
            <Text style={[styles.totalScore, { color: scoreColor(aiScore.total) }]}>
              {aiScore.total}
            </Text>
            <Text style={styles.totalMax}>/100</Text>
          </View>
          {aiScore.summary ? (
            <Text style={styles.summary}>{aiScore.summary}</Text>
          ) : null}

          <View style={styles.dimensions}>
            {aiScore.dimensions.map((dim) => (
              <View key={dim.key} style={styles.dimension}>
                <View style={styles.dimensionHeader}>
                  <Text style={styles.dimensionLabel}>
                    {DIMENSION_LABEL[dim.key]}
                  </Text>
                  <Text
                    style={[
                      styles.dimensionScore,
                      { color: scoreColor(dim.score) },
                    ]}
                  >
                    {dim.score}
                  </Text>
                </View>
                <View style={styles.dimensionTrack}>
                  <View
                    style={[
                      styles.dimensionFill,
                      {
                        width: `${dim.score}%`,
                        backgroundColor: scoreColor(dim.score),
                      },
                    ]}
                  />
                </View>
                {dim.comment ? (
                  <Text style={styles.dimensionComment}>{dim.comment}</Text>
                ) : null}
              </View>
            ))}
          </View>

          {aiScore.suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionsTitle}>改进建议</Text>
              {aiScore.suggestions.map((s, i) => (
                <Text key={`${i}-${s.slice(0, 8)}`} style={styles.suggestion}>
                  {i + 1}. {s}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              评分于 {formatDateTime(aiScore.scoredAt)}
            </Text>
            <Pressable
              accessibilityLabel="重新评分"
              onPress={onScore}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>重新评分</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
  },
  headerMeta: {
    color: "#64748B",
    fontSize: 12,
  },
  pending: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  pendingText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  body: {
    gap: 12,
  },
  hint: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 20,
  },
  errorText: {
    color: "#F87171",
    fontSize: 13,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    backgroundColor: "#38BDF8",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButton: {
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  totalScore: {
    fontSize: 44,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  totalMax: {
    color: "#64748B",
    fontSize: 15,
  },
  summary: {
    color: "#F8FAFC",
    fontSize: 14,
    lineHeight: 21,
  },
  dimensions: {
    gap: 12,
  },
  dimension: {
    gap: 5,
  },
  dimensionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dimensionLabel: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  dimensionScore: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  dimensionTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#0F172A",
    overflow: "hidden",
  },
  dimensionFill: {
    height: "100%",
    borderRadius: 3,
  },
  dimensionComment: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
  },
  suggestions: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  suggestionsTitle: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  suggestion: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  footerText: {
    color: "#64748B",
    fontSize: 12,
  },
});
