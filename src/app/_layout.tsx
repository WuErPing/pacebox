import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSettingsStore } from "@/store/settings";

export default function RootLayout() {
  useEffect(() => {
    void useSettingsStore.getState().hydrate();
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
      </Stack>
    </SafeAreaProvider>
  );
}
