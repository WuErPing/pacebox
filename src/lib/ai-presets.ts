export const MIMO_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";
export const MIMO_ASR_MODEL = "mimo-v2.5-asr";

export interface AiProviderPreset {
  label: string;
  baseUrl: string;
  model: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    label: "本地 LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "qwen3.6-35b-a3b-splash",
  },
  {
    label: "小米 MiMo",
    baseUrl: MIMO_BASE_URL,
    model: "mimo-v2.6-flash",
  },
];

export const MODEL_PRESETS = ["mimo-v2.6-flash", "qwen3.6-35b-a3b-splash"];

export function matchesProvider(
  config: { baseUrl: string },
  preset: AiProviderPreset,
): boolean {
  return config.baseUrl.replace(/\/+$/, "") === preset.baseUrl;
}