import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, sanitizeSettings } from "@/lib/timer-core";
import { SCENE_PRESETS, matchesPreset } from "./presets";

describe("SCENE_PRESETS", () => {
  it("ships keynote 25/30min presets with valid settings", () => {
    expect(SCENE_PRESETS.map((p) => p.settings.totalMinutes)).toEqual([25, 30]);
    for (const preset of SCENE_PRESETS) {
      expect(sanitizeSettings(preset.settings)).toEqual(preset.settings);
    }
  });

  it("highlights the 25min preset by default (matches DEFAULT_SETTINGS)", () => {
    const preset25 = SCENE_PRESETS.find(
      (p) => p.settings.totalMinutes === 25,
    )!;
    expect(matchesPreset(DEFAULT_SETTINGS, preset25)).toBe(true);
  });

  it("matchesPreset compares all three fields", () => {
    const preset = SCENE_PRESETS.find((p) => p.settings.totalMinutes === 30)!;
    expect(matchesPreset(preset.settings, preset)).toBe(true);
    expect(matchesPreset(DEFAULT_SETTINGS, preset)).toBe(false);
    expect(
      matchesPreset({ ...preset.settings, firstReminderPct: 60 }, preset),
    ).toBe(false);
  });
});
