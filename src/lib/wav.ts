/**
 * WAV 解析/编码/分片纯函数（node 可测，Hermes 兼容，无 Buffer/btoa 依赖）。
 * 目标格式：16kHz mono Int16 —— MiMo ASR 仅收 wav/mp3 且 Base64 后 ≤10MB。
 */

export const ASR_SAMPLE_RATE = 16_000;
export const MAX_ASR_BASE64_BYTES = 10 * 1024 * 1024;
export const DEFAULT_CHUNK_SECONDS = 180;

export interface WavInfo {
  format: "pcm16" | "float32";
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

/** 扫 RIFF chunk（容忍 LIST 等附加块），仅支持 PCM16 与 IEEE Float32 */
export function parseWav(bytes: Uint8Array): WavInfo {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    throw new Error("不是有效的 WAV 文件");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt: Omit<WavInfo, "dataOffset" | "dataLength"> | null = null;
  let data: { offset: number; length: number } | null = null;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = ascii(bytes, pos, 4);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt " && size >= 16) {
      const audioFormat = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      const bitsPerSample = view.getUint16(body + 14, true);
      if (audioFormat === 1 && bitsPerSample === 16) {
        fmt = { format: "pcm16", sampleRate, channels, bitsPerSample };
      } else if (audioFormat === 3 && bitsPerSample === 32) {
        fmt = { format: "float32", sampleRate, channels, bitsPerSample };
      } else {
        throw new Error(`不支持的 WAV 编码（format=${audioFormat}, bits=${bitsPerSample}）`);
      }
    } else if (id === "data") {
      data = { offset: body, length: Math.min(size, bytes.length - body) };
    }
    // chunk 按 2 字节对齐
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("WAV 缺少 fmt 或 data 块");
  if (fmt.channels < 1 || fmt.sampleRate < 1) throw new Error("WAV 参数非法");
  return { ...fmt, dataOffset: data.offset, dataLength: data.length };
}

/** 线性插值重采样到 16kHz */
export function resampleTo16k(
  samples: Float32Array,
  fromRate: number,
): Float32Array {
  if (fromRate === ASR_SAMPLE_RATE) return samples;
  const ratio = ASR_SAMPLE_RATE / fromRate;
  const outLength = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = src - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}

export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = Math.round(clamped * 32767);
  }
  return out;
}

/** 任意 WAV → 16kHz mono Int16 PCM（混声道均值 + 重采样） */
export function decodeWavToMono16k(bytes: Uint8Array): Int16Array {
  const info = parseWav(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bytesPerSample = info.bitsPerSample / 8;
  const frameCount = Math.floor(info.dataLength / (bytesPerSample * info.channels));
  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < info.channels; c++) {
      const at = info.dataOffset + (i * info.channels + c) * bytesPerSample;
      sum +=
        info.format === "pcm16"
          ? view.getInt16(at, true) / 32768
          : view.getFloat32(at, true);
    }
    mono[i] = sum / info.channels;
  }
  return floatToInt16(resampleTo16k(mono, info.sampleRate));
}

/** 44 字节标准头 + Int16 数据 */
export function encodeWav(
  samples: Int16Array,
  sampleRate: number = ASR_SAMPLE_RATE,
): Uint8Array {
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }
  return bytes;
}

export interface PcmChunk {
  samples: Int16Array;
  offsetMs: number;
  durationMs: number;
}

/** 按片长切分（默认 180s，Base64 后约 7.7MB < 10MB 上限） */
export function splitPcmChunks(
  samples: Int16Array,
  sampleRate: number = ASR_SAMPLE_RATE,
  chunkSeconds: number = DEFAULT_CHUNK_SECONDS,
): PcmChunk[] {
  const chunkSamples = Math.floor(chunkSeconds * sampleRate);
  const maxRawBytes = Math.floor(MAX_ASR_BASE64_BYTES / 4) * 3 - 44;
  if (chunkSamples * 2 > maxRawBytes) {
    throw new Error("分片过大，Base64 后将超过 10MB 上限");
  }
  const chunks: PcmChunk[] = [];
  for (let start = 0; start < samples.length; start += chunkSamples) {
    const slice = samples.subarray(start, Math.min(start + chunkSamples, samples.length));
    chunks.push({
      samples: slice,
      offsetMs: Math.round((start / sampleRate) * 1000),
      durationMs: Math.round((slice.length / sampleRate) * 1000),
    });
  }
  return chunks;
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 纯 JS Base64（Hermes 无 btoa/Buffer） */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const fullTriples = Math.floor(bytes.length / 3);
  for (let i = 0; i < fullTriples; i++) {
    const at = i * 3;
    const n = (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
    parts.push(
      BASE64_CHARS[(n >> 18) & 63] +
        BASE64_CHARS[(n >> 12) & 63] +
        BASE64_CHARS[(n >> 6) & 63] +
        BASE64_CHARS[n & 63],
    );
  }
  const rest = bytes.length - fullTriples * 3;
  if (rest === 1) {
    const n = bytes[fullTriples * 3] << 16;
    parts.push(BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63] + "==");
  } else if (rest === 2) {
    const at = fullTriples * 3;
    const n = (bytes[at] << 16) | (bytes[at + 1] << 8);
    parts.push(
      BASE64_CHARS[(n >> 18) & 63] +
        BASE64_CHARS[(n >> 12) & 63] +
        BASE64_CHARS[(n >> 6) & 63] +
        "=",
    );
  }
  return parts.join("");
}