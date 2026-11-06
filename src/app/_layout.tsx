import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAiConfigStore } from "@/store/ai-config";
import { useHistoryStore } from "@/store/history";
import { useSettingsStore } from "@/store/settings";

export default function RootLayout() {
  useEffect(() => {
    void useSettingsStore.getState().hydrate();
    void useHistoryStore.getState().hydrate();
    void useAiConfigStore.getState().hydrate();
  }, []);

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0F172A" },
          headerTintColor: "#F8FAFC",
          contentStyle: { backgroundColor: "#0F172A" },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: "设置" }} />
        <Stack.Screen name="rehearse" options={{ title: "演练" }} />
        <Stack.Screen name="history/index" options={{ title: "演练历史" }} />
        <Stack.Screen name="history/[id]" options={{ title: "演练报告" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
