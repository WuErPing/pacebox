import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  type TimerSettings,
} from "@/lib/timer-core";

const STORAGE_KEY = "pacebox.settings.v1";

interface SettingsState {
  settings: TimerSettings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<TimerSettings>) => void;
  resetDefaults: () => void;
}

async function persist(settings: TimerSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 持久化失败不阻塞使用
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TimerSettings>;
        set({ settings: sanitizeSettings(parsed), hydrated: true });
        return;
      }
    } catch {
      // 读取失败则使用默认值
    }
    set({ hydrated: true });
  },

  update: (patch) => {
    const settings = sanitizeSettings({ ...get().settings, ...patch });
    set({ settings });
    void persist(settings);
  },

  resetDefaults: () => {
    set({ settings: DEFAULT_SETTINGS });
    void persist(DEFAULT_SETTINGS);
  },
}));
