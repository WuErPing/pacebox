import { describe, expect, it } from "vitest";

import {
  ASR_SAMPLE_RATE,
  MAX_ASR_BASE64_BYTES,
  bytesToBase64,
  decodeWavToMono16k,
  encodeWav,
  floatToInt16,
  parseWav,
  resampleTo16k,
  splitPcmChunks,
} from "@/lib/wav";

/** 手工构造 WAV（可指定编码/声道/采样率/附加 chunk） */
function buildWav(opts: {
  format?: 1 | 3;
  bits?: 16 | 32;
  channels?: number;
  sampleRate?: number;
  data: Uint8Array;
  extraChunk?: boolean;
}): Uint8Array {
  const { format = 1, bits = 16, channels = 1, sampleRate = 16000, data } = opts;
  const extra = opts.extraChunk ? 8 + 4 : 0; // LIST + 4 字节 payload
  const bytes = new Uint8Array(44 + extra + data.length);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * channels * bits) / 8, true);
  view.setUint16(32, (channels * bits) / 8, true);
  view.setUint16(34, bits, true);
  let dataStart = 36;
  if (opts.extraChunk) {
    ascii(36, "LIST");
    view.setUint32(40, 4, true);
    dataStart = 48;
  }
  ascii(dataStart, "data");
  view.setUint32(dataStart + 4, data.length, true);
  bytes.set(data, dataStart + 8);
  return bytes;
}

function pcm16Bytes(values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((v, i) => view.setInt16(i * 2, v, true));
  return bytes;
}

describe("parseWav / encodeWav", () => {
  it("encodeWav → parseWav round-trip", () => {
    const samples = new Int16Array([0, 1000, -1000, 32767, -32767]);
    const info = parseWav(encodeWav(samples));
    expect(info.format).toBe("pcm16");
    expect(info.sampleRate).toBe(ASR_SAMPLE_RATE);
    expect(info.channels).toBe(1);
    expect(info.dataLength).toBe(samples.length * 2);
    const decoded = decodeWavToMono16k(encodeWav(samples));
    // float 归一化（/32768 → *32767）存在 ±1 LSB 量化误差
    decoded.forEach((v, i) => expect(Math.abs(v - samples[i])).toBeLessThanOrEqual(1));
  });

  it("容忍 LIST 等附加 chunk", () => {
    const bytes = buildWav({ data: pcm16Bytes([1, 2, 3]), extraChunk: true });
    const info = parseWav(bytes);
    expect(info.dataLength).toBe(6);
    expect(Array.from(decodeWavToMono16k(bytes))).toEqual([1, 2, 3]);
  });

  it("坏头与缺失块抛错", () => {
    expect(() => parseWav(new Uint8Array(10))).toThrow();
    const noData = buildWav({ data: pcm16Bytes([1]) }).slice(0, 36);
    expect(() => parseWav(noData)).toThrow();
  });

  it("不支持的编码抛错（8bit PCM）", () => {
    const bytes = buildWav({ data: new Uint8Array([1, 2]) });
    const view = new DataView(bytes.buffer);
    view.setUint16(34, 8, true);
    expect(() => parseWav(bytes)).toThrow(/不支持/);
  });
});

describe("decodeWavToMono16k", () => {
  it("float32 WAV 正确转换", () => {
    const data = new Uint8Array(8);
    new DataView(data.buffer).setFloat32(0, 0.5, true);
    new DataView(data.buffer).setFloat32(4, -0.5, true);
    const bytes = buildWav({ format: 3, bits: 32, data });
    const out = decodeWavToMono16k(bytes);
    expect(out[0]).toBe(Math.round(0.5 * 32767));
    expect(out[1]).toBe(Math.round(-0.5 * 32767));
  });

  it("立体声混为单声道（均值）", () => {
    const bytes = buildWav({
      channels: 2,
      data: pcm16Bytes([1000, 3000, -2000, -4000]),
    });
    expect(Array.from(decodeWavToMono16k(bytes))).toEqual([2000, -3000]);
  });

  it("48kHz 重采样到 16kHz", () => {
    const values = Array.from({ length: 480 }, (_, i) => (i % 2 ? 1000 : -1000));
    const bytes = buildWav({ sampleRate: 48000, data: pcm16Bytes(values) });
    const out = decodeWavToMono16k(bytes);
    expect(out.length).toBe(160);
  });
});

describe("resampleTo16k / floatToInt16", () => {
  it("16k 输入原样返回", () => {
    const samples = new Float32Array([0.1, 0.2]);
    expect(resampleTo16k(samples, 16000)).toBe(samples);
  });

  it("线性插值：48k 斜坡降采样保持线性", () => {
    const samples = new Float32Array(480).map((_, i) => i / 480);
    const out = resampleTo16k(samples, 48000);
    expect(out.length).toBe(160);
    expect(out[80]).toBeCloseTo(0.5, 2);
  });

  it("floatToInt16 clamp 到 ±1", () => {
    const out = floatToInt16(new Float32Array([2, -2, 0.5]));
    expect(Array.from(out)).toEqual([32767, -32767, Math.round(0.5 * 32767)]);
  });
});

describe("splitPcmChunks", () => {
  it("整除与余片：offsetMs 连续、总样本守恒", () => {
    const samples = new Int16Array(ASR_SAMPLE_RATE * 400); // 400s
    const chunks = splitPcmChunks(samples, ASR_SAMPLE_RATE, 180);
    expect(chunks.map((c) => c.offsetMs)).toEqual([0, 180_000, 360_000]);
    expect(chunks.map((c) => c.durationMs)).toEqual([180_000, 180_000, 40_000]);
    expect(chunks.reduce((n, c) => n + c.samples.length, 0)).toBe(samples.length);
  });

  it("空音频返回空数组", () => {
    expect(splitPcmChunks(new Int16Array(0))).toEqual([]);
  });

  it("每片 Base64 后不超过 10MB；片长过大抛错", () => {
    const chunks = splitPcmChunks(new Int16Array(ASR_SAMPLE_RATE * 180));
    const encodedBytes = Math.ceil((44 + chunks[0].samples.length * 2) / 3) * 4;
    expect(encodedBytes).toBeLessThanOrEqual(MAX_ASR_BASE64_BYTES);
    expect(() => splitPcmChunks(new Int16Array(16000), 16000, 600)).toThrow(
      /10MB/,
    );
  });
});

describe("bytesToBase64", () => {
  it("与 Node Buffer 结果一致（含各种余数长度）", () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 256, 1023]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) bytes[i] = (i * 37 + length) % 256;
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });
});