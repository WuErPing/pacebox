import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, sanitizeSettings } from "@/lib/timer-core";
import { SCENE_PRESETS, matchesPreset } from "./presets";

describe("SCENE_PRESETS", () => {
  it("ships keynote 20/30min presets with valid settings", () => {
    expect(SCENE_PRESETS.map((p) => p.settings.totalMinutes)).toEqual([20, 30]);
    for (const preset of SCENE_PRESETS) {
      expect(sanitizeSettings(preset.settings)).toEqual(preset.settings);
    }
  });

  it("matchesPreset compares all three fields", () => {
    const preset = SCENE_PRESETS[0]!;
    expect(matchesPreset(preset.settings, preset)).toBe(true);
    expect(matchesPreset(DEFAULT_SETTINGS, preset)).toBe(false);
    expect(
      matchesPreset({ ...preset.settings, firstReminderPct: 60 }, preset),
    ).toBe(false);
  });
});
