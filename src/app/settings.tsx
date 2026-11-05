import { BellRing } from "lucide-react-native";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { primeBell, ringBell } from "@/lib/bell";
import { ensurePermission, notifyNow } from "@/lib/notifier";
import {
  DEFAULT_SETTINGS,
  formatOffset,
  reminderPoints,
  sanitizeSettings,
  type ReminderId,
} from "@/lib/timer-core";
import { useSettingsStore } from "@/store/settings";

const REMINDER_LABEL: Record<ReminderId, string> = {
  first: "第一次提醒",
  second: "第二次提醒",
  end: "结束",
};

interface FieldProps {
  label: string;
  value: string;
  suffix: string;
  onCommit: (value: number | null) => void;
}

function NumberField({ label, value, suffix, onCommit }: FieldProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);

  // 外部值变化（如「恢复默认」）时同步，编辑中不打扰
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!focused) setText(value);
  }

  const commit = () => {
    const parsed = Number.parseInt(text, 10);
    if (Number.isFinite(parsed)) {
      onCommit(parsed);
    } else {
      setText(value); // 空/非法输入：还原为当前值
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          accessibilityLabel={label}
          keyboardType="number-pad"
          inputMode="numeric"
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onFocus={() => setFocused(true)}
          onChangeText={(next) => {
            const digits = next.replace(/[^0-9]/g, "");
            setText(digits);
            const parsed = Number.parseInt(digits, 10);
            if (Number.isFinite(parsed)) onCommit(parsed);
          }}
          onSubmitEditing={commit}
          style={styles.input}
          value={text}
        />
        <Text style={styles.fieldSuffix}>{suffix}</Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const resetDefaults = useSettingsStore((s) => s.resetDefaults);

  // 用 sanitize 后的设置预览提醒时刻
  const preview = reminderPoints(sanitizeSettings(settings));

  const handleTest = async () => {
    primeBell();
    const granted = await ensurePermission();
    void ringBell();
    if (granted) {
      void notifyNow("Pacebox 测试提醒", "铃声与系统提示工作正常");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <NumberField
        label="总时长"
        suffix="分钟（缺省 25）"
        value={String(settings.totalMinutes)}
        onCommit={(v) => update({ totalMinutes: v ?? DEFAULT_SETTINGS.totalMinutes })}
      />
      <NumberField
        label="第一次提醒"
        suffix="%（缺省 50，即时间过半）"
        value={String(settings.firstReminderPct)}
        onCommit={(v) => update({ firstReminderPct: v ?? DEFAULT_SETTINGS.firstReminderPct })}
      />
      <NumberField
        label="第二次提醒"
        suffix="%（缺省 75，即过了 3/4）"
        value={String(settings.secondReminderPct)}
        onCommit={(v) => update({ secondReminderPct: v ?? DEFAULT_SETTINGS.secondReminderPct })}
      />

      <View style={styles.preview}>
        <Text style={styles.previewTitle}>提醒时刻</Text>
        {preview.map((point) => (
          <Text key={point.id} style={styles.previewRow}>
            {REMINDER_LABEL[point.id]}：{formatOffset(point.atMs)}
          </Text>
        ))}
      </View>

      <Pressable
        accessibilityLabel="测试提醒"
        onPress={() => void handleTest()}
        style={({ pressed }) => [styles.testButton, pressed && styles.buttonPressed]}
      >
        <BellRing color="#38BDF8" size={18} />
        <Text style={styles.testButtonText}>测试铃声与系统提示</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="恢复默认"
        onPress={resetDefaults}
        style={({ pressed }) => [styles.resetButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.resetButtonText}>恢复默认（25 分钟 / 50% / 75%）</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  content: {
    padding: 24,
    gap: 20,
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    width: 120,
    backgroundColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#F8FAFC",
    fontSize: 17,
    fontVariant: ["tabular-nums"],
  },
  fieldSuffix: {
    color: "#94A3B8",
    fontSize: 13,
    flex: 1,
  },
  preview: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  previewTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  previewRow: {
    color: "#94A3B8",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  testButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderColor: "#38BDF8",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 12,
  },
  testButtonText: {
    color: "#38BDF8",
    fontSize: 15,
    fontWeight: "600",
  },
  resetButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  resetButtonText: {
    color: "#64748B",
    fontSize: 14,
  },
  buttonPressed: {
    opacity: 0.75,
  },
});
