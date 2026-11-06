import { StyleSheet, Text, View } from "react-native";

import type { SpeechMetrics } from "@/lib/rehearsal-types";
import { formatOffset, type ReminderId } from "@/lib/timer-core";

const TIME_STATUS_LABEL: Record<SpeechMetrics["timeStatus"], string> = {
  under: "提前结束",
  "on-target": "节奏合适",
  over: "超时",
};

const TIME_STATUS_COLOR: Record<SpeechMetrics["timeStatus"], string> = {
  under: "#F59E0B",
  "on-target": "#34D399",
  over: "#F87171",
};

const REMINDER_LABEL: Record<ReminderId, string> = {
  first: "第一次提醒",
  second: "第二次提醒",
  end: "结束时刻",
};

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

interface MetricsCardProps {
  metrics: SpeechMetrics;
}

/** 本地客观指标：语速、时间达成、填充词、停顿与分段进度 */
export function MetricsCard({ metrics }: MetricsCardProps) {
  const isZh = metrics.lang === "zh";
  const rate = isZh ? metrics.charsPerMin : metrics.wordsPerMin;
  const rateUnit = isZh ? "字/分钟" : "词/分钟";
  const rateHint = isZh ? "参考 180–260 字/分" : "参考 110–160 词/分";
  const statusColor = TIME_STATUS_COLOR[metrics.timeStatus];

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>语速（{isZh ? "中文" : "英文"}）</Text>
          <Text style={styles.statValue}>
            {rate == null ? "—" : rate}
            {rate == null ? "" : ` ${rateUnit}`}
          </Text>
          <Text style={styles.statHint}>
            {rate == null ? "有效说话不足 5 秒" : rateHint}
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>时间达成</Text>
          <Text style={styles.statValue}>
            {pct(metrics.timeAchievementRatio)}
          </Text>
          <Text style={[styles.statHint, { color: statusColor }]}>
            {TIME_STATUS_LABEL[metrics.timeStatus]}
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>填充词</Text>
          <Text style={styles.statValue}>
            {metrics.fillerCount}
            {metrics.fillerCount > 0 ? ` 次` : ""}
          </Text>
          <Text style={styles.statHint}>
            {metrics.fillerPerMin > 0
              ? `${metrics.fillerPerMin} 次/分钟`
              : "无填充词"}
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>长停顿</Text>
          <Text style={styles.statValue}>{metrics.longPauses.length} 次</Text>
          <Text style={styles.statHint}>
            合计 {formatOffset(metrics.totalPauseMs)}
          </Text>
        </View>
      </View>

      {Object.keys(metrics.fillerBreakdown).length > 0 ? (
        <View style={styles.chips}>
          {Object.entries(metrics.fillerBreakdown).map(([word, count]) => (
            <View key={word} style={styles.chip}>
              <Text style={styles.chipText}>
                {word} ×{count}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>分段进度（已说内容 vs 理想占比）</Text>
        {metrics.segmentProgress.map((item) => (
          <View key={item.reminderId} style={styles.progressRow}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>
                {REMINDER_LABEL[item.reminderId]} {formatOffset(item.atMs)}
              </Text>
              <Text style={styles.progressValue}>
                实际 {pct(item.spokenRatio)} · 理想 {pct(item.expectedRatio)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(1, item.spokenRatio) * 100}%` },
                ]}
              />
              <View
                style={[
                  styles.progressMarker,
                  { left: `${Math.min(1, item.expectedRatio) * 100}%` },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 12,
  },
  statValue: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "600",
  },
  statHint: {
    color: "#64748B",
    fontSize: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    backgroundColor: "#1E293B",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  section: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
  },
  progressRow: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    color: "#94A3B8",
    fontSize: 13,
  },
  progressValue: {
    color: "#64748B",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0F172A",
    overflow: "visible",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#38BDF8",
  },
  progressMarker: {
    position: "absolute",
    top: -3,
    bottom: -3,
    width: 2,
    marginLeft: -1,
    backgroundColor: "#F8FAFC",
    borderRadius: 1,
  },
});
