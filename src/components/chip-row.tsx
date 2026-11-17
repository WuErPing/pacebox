import { Pressable, StyleSheet, Text, View } from "react-native";

export interface ChipOption {
  label: string;
  value: string;
}

interface ChipRowProps {
  options: ChipOption[];
  value: string;
  onSelect: (value: string) => void;
}

export function ChipRow({ options, value, onSelect }: ChipRowProps) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {option.label}
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
    flexWrap: "wrap",
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