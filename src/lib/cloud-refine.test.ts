import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiRequestError } from "@/lib/ai-scoring";
import {
  refineTranscription,
  wallToElapsedMs,
  type CloudRefineInput,
} from "@/lib/cloud-refine";
import { encodeWav } from "@/lib/wav";
import type { AiConfig } from "@/store/ai-config";

const mocks = vi.hoisted(() => ({
  loadBytes: vi.fn(),
  decodeBlob: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("@/lib/recording-storage", () => ({
  loadRecordingBytes: mocks.loadBytes,
}));
vi.mock("@/lib/audio-decode", () => ({
  decodeAudioBlobToWav16k: mocks.decodeBlob,
}));
vi.mock("@/lib/mimo-asr", () => ({
  transcribeChunk: mocks.transcribe,
}));

const CFG: AiConfig = {
  baseUrl: "https://mimo.test/v1",
  apiKey: "sk-mimo",
  model: "mimo-v2.6-flash",
  asrModel: "mimo-v2.5-asr",
};

/** 200s 静音 WAV → 2 片（180s + 20s） */
const WAV_200S = encodeWav(new Int16Array(16_000 * 200));

function input(overrides: Partial<CloudRefineInput> = {}): CloudRefineInput {
  return {
    audio: { ref: "idb:s1", mime: "audio/wav" },
    lang: "zh-CN",
    totalElapsedMs: 200_000,
    pauseRanges: [],
    config: CFG,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.loadBytes.mockReset();
  mocks.decodeBlob.mockReset();
  mocks.transcribe.mockReset();
  mocks.loadBytes.mockResolvedValue(WAV_200S);
  mocks.transcribe.mockImplementation(async () => "文本");
});

describe("wallToElapsedMs", () => {
  const pauses = [{ startWallMs: 60_000, endWallMs: 90_000 }];

  it("扣除完整暂停区间", () => {
    expect(wallToElapsedMs(120_000, pauses, 200_000)).toBe(90_000);
    expect(wallToElapsedMs(30_000, pauses, 200_000)).toBe(30_000);
  });

  it("暂停区间跨越偏移时只扣重叠部分", () => {
    expect(wallToElapsedMs(75_000, pauses, 200_000)).toBe(60_000);
  });

  it("clamp 到 [0, totalElapsedMs]", () => {
    expect(wallToElapsedMs(500_000, pauses, 200_000)).toBe(200_000);
    expect(wallToElapsedMs(70_000, pauses, 50_000)).toBe(50_000);
  });
});

describe("refineTranscription 跳过判定", () => {
  it("无录音 / 未开启 / 缺 key / m4a 均 skipped 且不发请求", async () => {
    expect((await refineTranscription(input({ audio: null }))).status).toBe("skipped");
    expect(
      (await refineTranscription(input({ config: { ...CFG, asrModel: "" } }))).status,
    ).toBe("skipped");
    expect(
      (await refineTranscription(input({ config: { ...CFG, apiKey: "" } }))).status,
    ).toBe("skipped");
    expect(
      (await refineTranscription(input({ audio: { ref: "f", mime: "audio/mp4" } }))).status,
    ).toBe("skipped");
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("录音读取失败 skipped", async () => {
    mocks.loadBytes.mockResolvedValue(null);
    expect((await refineTranscription(input())).status).toBe("skipped");
  });

  it("空录音 skipped", async () => {
    mocks.loadBytes.mockResolvedValue(encodeWav(new Int16Array(0)));
    expect((await refineTranscription(input())).status).toBe("skipped");
  });
});

describe("refineTranscription WAV 路径", () => {
  it("两片组装：片边界时间戳 + isFinal，进度回调", async () => {
    mocks.transcribe
      .mockResolvedValueOnce("第一段")
      .mockResolvedValueOnce("第二段");
    const notes: string[] = [];
    const result = await refineTranscription(
      input({ onProgress: (n) => notes.push(n) }),
    );
    expect(result.status).toBe("refined");
    if (result.status !== "refined") return;
    expect(result.segments).toEqual([
      { text: "第一段", startMs: 0, endMs: 180_000, isFinal: true },
      { text: "第二段", startMs: 180_000, endMs: 200_000, isFinal: true },
    ]);
    expect(mocks.transcribe).toHaveBeenCalledTimes(2);
    expect(notes[0]).toBe("云端精校中（0/2）…");
    expect(notes[notes.length - 1]).toBe("云端精校中（2/2）…");
  });

  it("含暂停时按墙钟扣除映射并 clamp", async () => {
    mocks.transcribe
      .mockResolvedValueOnce("第一段")
      .mockResolvedValueOnce("第二段");
    const result = await refineTranscription(
      input({
        totalElapsedMs: 170_000,
        pauseRanges: [{ startWallMs: 60_000, endWallMs: 90_000 }],
      }),
    );
    if (result.status !== "refined") throw new Error("expected refined");
    expect(result.segments[1].startMs).toBe(150_000);
    expect(result.segments[1].endMs).toBe(170_000);
  });

  it("空文本片跳过；全空整体 failed", async () => {
    mocks.transcribe.mockResolvedValueOnce("").mockResolvedValueOnce("有内容");
    const partial = await refineTranscription(input());
    if (partial.status !== "refined") throw new Error("expected refined");
    expect(partial.segments).toHaveLength(1);
    expect(partial.segments[0].text).toBe("有内容");

    mocks.transcribe.mockResolvedValue("  ");
    const empty = await refineTranscription(input());
    expect(empty).toMatchObject({ status: "failed", error: "云端未识别到内容" });
  });

  it("坏 WAV 头 failed", async () => {
    mocks.loadBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    expect((await refineTranscription(input())).status).toBe("failed");
  });

  it("一片失败整体 failed，其余请求被 abort", async () => {
    let calls = 0;
    mocks.transcribe.mockImplementation(
      async (_cfg: unknown, _wav: unknown, _lang: unknown, signal: AbortSignal) => {
        calls += 1;
        if (calls === 1) {
          throw new AiRequestError("http", "AI 服务错误（500）", 500);
        }
        // 其余片挂起，验证失败后被 abort 唤醒
        return new Promise<string>((_resolve, reject) => {
          const onAbort = () =>
            reject(new DOMException("Aborted", "AbortError"));
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort);
        });
      },
    );
    const result = await refineTranscription(input());
    expect(result).toMatchObject({ status: "failed", error: "AI 服务错误（500）" });
    expect(calls).toBe(2);
  });

  it("外部 signal 已 abort 时不上送", async () => {
    mocks.transcribe.mockImplementation(
      async (_cfg: unknown, _wav: unknown, _lang: unknown, signal: AbortSignal) => {
        expect(signal.aborted).toBe(true);
        throw new DOMException("Aborted", "AbortError");
      },
    );
    const result = await refineTranscription(input({ signal: AbortSignal.abort() }));
    expect(result.status).toBe("failed");
  });
});

describe("refineTranscription Web 解码路径", () => {
  it("webm 经浏览器解码后精校", async () => {
    mocks.loadBytes.mockResolvedValue(new Uint8Array([9, 9, 9]));
    mocks.decodeBlob.mockResolvedValue(WAV_200S);
    mocks.transcribe.mockResolvedValue("云端全文");
    const result = await refineTranscription(
      input({ audio: { ref: "idb:s1", mime: "audio/webm" } }),
    );
    expect(mocks.decodeBlob).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("refined");
  });

  it("浏览器解码失败 skipped", async () => {
    mocks.loadBytes.mockResolvedValue(new Uint8Array([9, 9, 9]));
    mocks.decodeBlob.mockRejectedValue(new Error("decode failed"));
    const result = await refineTranscription(
      input({ audio: { ref: "idb:s1", mime: "audio/webm" } }),
    );
    expect(result).toMatchObject({ status: "skipped" });
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });
});