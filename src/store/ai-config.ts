import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export interface AiConfig {
  /** OpenAI 兼容接口根地址（含 /v1，不含 /chat/completions） */
  baseUrl: string;
  /** 仅存设备本地 */
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

const STORAGE_KEY = "pacebox.ai.v1";

function sanitizeAiConfig(input: Partial<AiConfig>): AiConfig {
  const str = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  return {
    baseUrl: str(input.baseUrl, DEFAULT_AI_CONFIG.baseUrl).replace(/\/+$/, ""),
    apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : "",
    model: str(input.model, DEFAULT_AI_CONFIG.model),
  };
}

interface AiConfigState {
  config: AiConfig;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<AiConfig>) => void;
  resetDefaults: () => void;
}

async function persist(config: AiConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 持久化失败不阻塞使用
  }
}

export const useAiConfigStore = create<AiConfigState>((set, get) => ({
  config: DEFAULT_AI_CONFIG,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AiConfig>;
        set({ config: sanitizeAiConfig(parsed), hydrated: true });
        return;
      }
    } catch {
      // 读取失败则使用默认值
    }
    set({ hydrated: true });
  },

  update: (patch) => {
    const config = sanitizeAiConfig({ ...get().config, ...patch });
    set({ config });
    void persist(config);
  },

  resetDefaults: () => {
    set({ config: DEFAULT_AI_CONFIG });
    void persist(DEFAULT_AI_CONFIG);
  },
}));
