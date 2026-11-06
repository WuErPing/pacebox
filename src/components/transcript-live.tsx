import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { TranscriptSegment } from "@/lib/rehearsal-types";
import { formatOffset } from "@/lib/timer-core";

const MAX_VISIBLE = 30;

interface TranscriptLiveProps {
  segments: TranscriptSegment[];
  interimText: string;
}

/** 实时转写面板：尾部 30 段带时间戳，未定稿内容灰字显示，自动滚到底部 */
export function TranscriptLive({ segments, interimText }: TranscriptLiveProps) {
  const scrollRef = useRef<ScrollView>(null);
  const visible = segments.slice(-MAX_VISIBLE);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [segments.length, interimText]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {visible.length === 0 && !interimText ? (
          <Text style={styles.placeholder}>
            开始说话后，转写内容会实时显示在这里
          </Text>
        ) : null}
        {visible.map((s, i) => (
          <Text key={`${s.startMs}-${i}`} style={styles.segment}>
            <Text style={styles.timestamp}>[{formatOffset(s.startMs)}]</Text>{" "}
            {s.text}
          </Text>
        ))}
        {interimText ? <Text style={styles.interim}>{interimText}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    overflow: "hidden",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 14,
    gap: 8,
  },
  placeholder: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    marginTop: 24,
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
  interim: {
    color: "#94A3B8",
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
});
