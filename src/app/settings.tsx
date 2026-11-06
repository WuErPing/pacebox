import { BellRing, Sparkles } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { testAiConnection } from "@/lib/ai-scoring";
import { primeBell, ringBell } from "@/lib/bell";
import { ensurePermission, notifyNow } from "@/lib/notifier";
import {
  DEFAULT_SETTINGS,
  formatOffset,
  reminderPoints,
  sanitizeSettings,
  type ReminderId,
} from "@/lib/timer-core";
import { useAiConfigStore } from "@/store/ai-config";
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

interface AiFieldProps {
  label: string;
  value: string;
  placeholder: string;
  secure?: boolean;
  onCommit: (text: string) => void;
}

/** 文本输入：本地编辑，失焦/提交时写回 store（避免逐字符 sanitize 干扰输入） */
function AiTextField({ label, value, placeholder, secure, onCommit }: AiFieldProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!focused) setText(value);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={secure ? "default" : "url"}
        onBlur={() => {
          setFocused(false);
          onCommit(text.trim());
        }}
        onFocus={() => setFocused(true)}
        onChangeText={setText}
        onSubmitEditing={() => onCommit(text.trim())}
        placeholder={placeholder}
        placeholderTextColor="#64748B"
        secureTextEntry={secure}
        style={styles.aiInput}
        value={text}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const resetDefaults = useSettingsStore((s) => s.resetDefaults);

  const aiConfig = useAiConfigStore((s) => s.config);
  const aiUpdate = useAiConfigStore((s) => s.update);
  const [aiTest, setAiTest] = useState<{
    running: boolean;
    message: string | null;
    ok: boolean;
  }>({ running: false, message: null, ok: false });

  // 用 sanitize 后的设置预览提醒时刻
  const preview = reminderPoints(sanitizeSettings(settings));

  const [notifyTest, setNotifyTest] = useState<{
    message: string;
    ok: boolean;
  } | null>(null);

  const handleTest = async () => {
    primeBell();
    const granted = await ensurePermission();
    void ringBell();
    if (!granted) {
      setNotifyTest({
        ok: false,
        message:
          "系统通知权限未授予。请在浏览器地址栏的站点设置中把「通知」改为允许；macOS 还需在 系统设置 → 通知 中允许该浏览器显示横幅，并关闭勿扰/专注模式后重试。",
      });
      return;
    }
    const shown = await notifyNow("Pacebox 测试提醒", "铃声与系统提示工作正常");
    setNotifyTest(
      shown
        ? {
            ok: true,
            message:
              "已弹出测试通知。本机通知服务在线时经 osascript 弹出（检查 系统设置 → 通知 → 脚本编辑器）；未启动时回退浏览器通知（检查该浏览器的提醒样式）。若仍看不到，请关闭勿扰/专注模式。",
          }
        : {
            ok: false,
            message:
              "通知发送失败：本机通知服务未启动（npm run notify:server），且浏览器通知被拒绝或该环境不支持。",
          },
    );
  };

  const handleTestAi = async () => {
    setAiTest({ running: true, message: null, ok: false });
    const result = await testAiConnection(useAiConfigStore.getState().config);
    setAiTest({
      running: false,
      message: result ?? "连接成功，AI 评分已就绪",
      ok: result === null,
    });
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

      {notifyTest ? (
        <Text
          style={[
            styles.notifyHint,
            { color: notifyTest.ok ? "#34D399" : "#F59E0B" },
          ]}
        >
          {notifyTest.message}
        </Text>
      ) : null}

      <Pressable
        accessibilityLabel="恢复默认"
        onPress={resetDefaults}
        style={({ pressed }) => [styles.resetButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.resetButtonText}>恢复默认（25 分钟 / 50% / 75%）</Text>
      </Pressable>

      <View style={styles.aiSection}>
        <View style={styles.aiHeader}>
          <Sparkles color="#38BDF8" size={16} />
          <Text style={styles.aiTitle}>AI 评分</Text>
        </View>
        <Text style={styles.aiNote}>
          缺省指向本地 LM Studio（Developer → Start Server，http://localhost:1234/v1），也可改填任意
          OpenAI 兼容接口（/chat/completions）。API Key 仅保存在本机，不会上传到其他服务。
        </Text>
        <AiTextField
          label="接口地址"
          value={aiConfig.baseUrl}
          placeholder="http://localhost:1234/v1"
          onCommit={(text) => aiUpdate({ baseUrl: text })}
        />
        <AiTextField
          label="API Key"
          value={aiConfig.apiKey}
          placeholder="本地 LM Studio 可填任意值"
          secure
          onCommit={(text) => aiUpdate({ apiKey: text })}
        />
        <AiTextField
          label="模型"
          value={aiConfig.model}
          placeholder="qwen3.6-35b-a3b-splash"
          onCommit={(text) => aiUpdate({ model: text })}
        />
        <Pressable
          accessibilityLabel="测试连接"
          disabled={aiTest.running}
          onPress={() => void handleTestAi()}
          style={({ pressed }) => [
            styles.testButton,
            pressed && styles.buttonPressed,
          ]}
        >
          {aiTest.running ? (
            <ActivityIndicator color="#38BDF8" size="small" />
          ) : (
            <Sparkles color="#38BDF8" size={18} />
          )}
          <Text style={styles.testButtonText}>
            {aiTest.running ? "测试中…" : "测试连接"}
          </Text>
        </Pressable>
        {aiTest.message ? (
          <Text style={aiTest.ok ? styles.aiOk : styles.aiFail}>
            {aiTest.message}
          </Text>
        ) : null}
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
  notifyHint: {
    fontSize: 13,
    lineHeight: 19,
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
  aiSection: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },
  aiNote: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 18,
  },
  aiInput: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#F8FAFC",
    fontSize: 15,
  },
  aiOk: {
    color: "#34D399",
    fontSize: 13,
    lineHeight: 19,
  },
  aiFail: {
    color: "#F87171",
    fontSize: 13,
    lineHeight: 19,
  },
});
