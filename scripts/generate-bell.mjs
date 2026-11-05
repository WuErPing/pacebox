/**
 * 生成提醒铃声 assets/sounds/bell.wav
 * 双音钟声：基频 + 泛音，指数衰减，16-bit PCM 单声道。
 * 用法：node scripts/generate-bell.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "assets", "sounds", "bell.wav");

const sampleRate = 44100;
const durationSec = 1.6;
const totalSamples = Math.floor(sampleRate * durationSec);

function* strike(startSec, freqs, gain) {
  const start = Math.floor(startSec * sampleRate);
  for (let i = 0; i < totalSamples - start; i += 1) {
    const t = i / sampleRate;
    const decay = Math.exp(-3.2 * t);
    let v = 0;
    for (const [freq, amp] of freqs) {
      v += amp * Math.sin(2 * Math.PI * freq * t);
    }
    yield { index: start + i, value: gain * decay * v };
  }
}

const samples = new Float64Array(totalSamples);
// 两次敲击：主音 880Hz（A5）+ 泛音，间隔 0.35s，声音更"铃"
const strikes = [
  strike(0, [[880, 0.9], [1318.5, 0.35], [1760, 0.18]], 0.55),
  strike(0.35, [[880, 0.9], [1318.5, 0.35], [1760, 0.18]], 0.4),
];
for (const s of strikes) {
  for (const { index, value } of s) {
    samples[index] += value;
  }
}

// 归一化，避免削波
let peak = 0;
for (const v of samples) peak = Math.max(peak, Math.abs(v));
const scale = peak > 0.95 ? 0.95 / peak : 1;

const dataSize = totalSamples * 2;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16); // PCM chunk size
buffer.writeUInt16LE(1, 20); // PCM format
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
buffer.writeUInt16LE(2, 32); // block align
buffer.writeUInt16LE(16, 34); // bits per sample
buffer.write("data", 36);
buffer.writeUInt32LE(dataSize, 40);
for (let i = 0; i < totalSamples; i += 1) {
  const v = Math.max(-1, Math.min(1, samples[i] * scale));
  buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, buffer);
console.log(`wrote ${outPath} (${buffer.length} bytes)`);
