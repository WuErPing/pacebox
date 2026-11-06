import { Pressable, StyleSheet, Text, View } from "react-native";

import { SCENE_PRESETS, matchesPreset } from "@/lib/presets";
import type { TimerSettings } from "@/lib/timer-core";

interface PresetChipsProps {
  settings: TimerSettings;
  onSelect: (settings: TimerSettings) => void;
}

export function PresetChips({ settings, onSelect }: PresetChipsProps) {
  return (
    <View style={styles.row}>
      {SCENE_PRESETS.map((preset) => {
        const active = matchesPreset(settings, preset);
        return (
          <Pressable
            key={preset.label}
            accessibilityLabel={preset.label}
            accessibilityRole="button"
            onPress={() => onSelect(preset.settings)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {preset.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    alignSelf: "center",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#1E293B",
  },
  chipActive: {
    borderColor: "#38BDF8",
    backgroundColor: "rgba(56, 189, 248, 0.12)",
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#38BDF8",
  },
});
