import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSession, finalizeRehearsal } from "@/lib/rehearsal-finalize";
import type { TranscriptSegment } from "@/lib/rehearsal-types";
import type { TimerSettings } from "@/lib/timer-core";

const mocks = vi.hoisted(() => ({
  addSession: vi.fn(),
  persistRecording: vi.fn(),
  refineTranscription: vi.fn(),
  aiConfig: { baseUrl: "", apiKey: "", model: "", asrModel: "" },
}));

vi.mock("@/lib/recording-storage", () => ({
  persistRecording: mocks.persistRecording,
}));
vi.mock("@/lib/cloud-refine", () => ({
  refineTranscription: mocks.refineTranscription,
}));
vi.mock("@/store/history", () => ({
  useHistoryStore: { getState: () => ({ addSession: mocks.addSession }) },
}));
vi.mock("@/store/ai-config", () => ({
  useAiConfigStore: { getState: () => ({ config: mocks.aiConfig }) },
}));

const SETTINGS: TimerSettings = {
  totalMinutes: 20,
  firstReminderPct: 50,
  secondReminderPct: 75,
};

const SEGMENTS: TranscriptSegment[] = [
  { text: "字".repeat(150), startMs: 10_000, endMs: 30_000, isFinal: true },
  { text: "字".repeat(150), startMs: 30_000, endMs: 70_000, isFinal: true },
];

beforeEach(() => {
  mocks.addSession.mockReset();
  mocks.addSession.mockResolvedValue(undefined);
  mocks.persistRecording.mockReset();
  mocks.refineTranscription.mockReset();
  mocks.refineTranscription.mockResolvedValue({
    status: "skipped",
    reason: "未开启云端精校",
  });
  mocks.aiConfig.baseUrl = "";
  mocks.aiConfig.apiKey = "";
  mocks.aiConfig.model = "";
  mocks.aiConfig.asrModel = "";
});

describe("buildSession", () => {
  it("有转写时计算指标，AI 已配置则为 pending", () => {
    const session = buildSession({
      id: "s1",
      startedAt: 1_000,
      endedAt: 2_000,
      settings: SETTINGS,
      completedNaturally: true,
      totalElapsedMs: 1_200_000,
      transcriptionSupported: true,
      segments: SEGMENTS,
      aiConfigured: true,
      audio: { ref: "file:///s1.wav", mime: "audio/wav" },
    });
    expect(session.metrics).not.toBeNull();
    expect(session.metrics!.charsPerMin).toBe(300);
    expect(session.aiStatus).toBe("pending");
    expect(session.audioRef).toBe("file:///s1.wav");
    expect(session.audioMime).toBe("audio/wav");
  });

  it("无转写时 metrics 为 null，AI 未配置则为 unconfigured", () => {
    const session = buildSession({
      id: "s2",
      startedAt: 1_000,
      endedAt: 2_000,
      settings: SETTINGS,
      completedNaturally: false,
      totalElapsedMs: 600_000,
      transcriptionSupported: false,
      segments: [],
      aiConfigured: false,
      audio: null,
    });
    expect(session.metrics).toBeNull();
    expect(session.aiStatus).toBe("unconfigured");
    expect(session.audioRef).toBeNull();
    expect(session.audioMime).toBeNull();
    expect(session.completedNaturally).toBe(false);
  });
});

describe("finalizeRehearsal", () => {
  it("录音持久化 -> 组装 -> 写入历史，返回同一 session", async () => {
    mocks.aiConfig.baseUrl = "https://api.openai.com/v1";
    mocks.aiConfig.apiKey = "sk-test";
    mocks.aiConfig.model = "gpt-4o-mini";
    mocks.persistRecording.mockImplementation(async (id: string) => ({
      ref: `file:///rehearsals/${id}.wav`,
      mime: "audio/wav",
    }));

    const session = await finalizeRehearsal({
      startedAt: 1_000,
      settings: SETTINGS,
      completedNaturally: true,
      totalElapsedMs: 1_200_000,
      transcriptionSupported: true,
      segments: SEGMENTS,
      recording: { uri: "file:///cache/rec.wav" },
    });

    expect(mocks.persistRecording).toHaveBeenCalledWith(session.id, {
      uri: "file:///cache/rec.wav",
    });
    expect(mocks.addSession).toHaveBeenCalledWith(session);
    expect(session.aiStatus).toBe("pending");
    expect(session.audioRef).toBe(`file:///rehearsals/${session.id}.wav`);
    expect(session.metrics).not.toBeNull();
  });

  it("无录音时 audioRef 为 null，AI 未配置为 unconfigured", async () => {
    mocks.persistRecording.mockResolvedValue(null);

    const session = await finalizeRehearsal({
      startedAt: 1_000,
      settings: SETTINGS,
      completedNaturally: false,
      totalElapsedMs: 600_000,
      transcriptionSupported: true,
      segments: SEGMENTS,
      recording: null,
    });

    expect(mocks.persistRecording).toHaveBeenCalledWith(session.id, null);
    expect(session.audioRef).toBeNull();
    expect(session.aiStatus).toBe("unconfigured");
  });
});

describe("finalizeRehearsal 云端精校", () => {
  const BASE = {
    startedAt: 1_000,
    settings: SETTINGS,
    completedNaturally: true,
    totalElapsedMs: 1_200_000,
    transcriptionSupported: true,
    segments: SEGMENTS,
    recording: { uri: "file:///cache/rec.wav" },
  };

  const CLOUD_SEGMENTS: TranscriptSegment[] = [
    { text: "云".repeat(300), startMs: 0, endMs: 60_000, isFinal: true },
  ];

  beforeEach(() => {
    mocks.persistRecording.mockResolvedValue({
      ref: "file:///rehearsals/rec.wav",
      mime: "audio/wav",
    });
  });

  it("refined：云端 segments 替换本地并重算指标", async () => {
    mocks.refineTranscription.mockResolvedValue({
      status: "refined",
      segments: CLOUD_SEGMENTS,
    });
    const session = await finalizeRehearsal(BASE);
    expect(session.segments).toEqual(CLOUD_SEGMENTS);
    expect(session.transcriptSource).toBe("mimo");
    expect(session.refineError).toBeNull();
    expect(session.metrics!.charsPerMin).toBe(300);
  });

  it("failed：保留本地 segments 并记录 refineError", async () => {
    mocks.refineTranscription.mockResolvedValue({
      status: "failed",
      error: "HTTP 500：服务异常",
    });
    const session = await finalizeRehearsal(BASE);
    expect(session.segments).toEqual(SEGMENTS);
    expect(session.transcriptSource).toBe("local");
    expect(session.refineError).toBe("HTTP 500：服务异常");
    expect(mocks.addSession).toHaveBeenCalledWith(session);
  });

  it("skipped：本地转写，无错误", async () => {
    const session = await finalizeRehearsal(BASE);
    expect(session.segments).toEqual(SEGMENTS);
    expect(session.transcriptSource).toBe("local");
    expect(session.refineError).toBeNull();
  });

  it("精校抛异常不阻断入库", async () => {
    mocks.refineTranscription.mockRejectedValue(new Error("boom"));
    const session = await finalizeRehearsal(BASE);
    expect(session.segments).toEqual(SEGMENTS);
    expect(session.refineError).toBe("云端精校失败，请重试");
    expect(mocks.addSession).toHaveBeenCalledWith(session);
  });

  it("skipRefine 时完全不调用精校", async () => {
    const session = await finalizeRehearsal({ ...BASE, skipRefine: true });
    expect(mocks.refineTranscription).not.toHaveBeenCalled();
    expect(session.transcriptSource).toBe("local");
  });

  it("lang/pauseRanges/onProgress 透传给精校", async () => {
    const onRefineProgress = vi.fn();
    const pauseRanges = [{ startWallMs: 5_000, endWallMs: 8_000 }];
    await finalizeRehearsal({
      ...BASE,
      lang: "en-US",
      pauseRanges,
      onRefineProgress,
    });
    expect(mocks.refineTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: "en-US",
        pauseRanges,
        onProgress: onRefineProgress,
        totalElapsedMs: 1_200_000,
      }),
    );
  });
});
