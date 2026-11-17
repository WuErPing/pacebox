import { encodeWav, floatToInt16 } from "@/lib/wav";

/** Web 录音（webm/opus 等）→ 浏览器解码 → 16kHz mono Int16 WAV */
export async function decodeAudioBlobToWav16k(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const length = Math.max(1, Math.ceil(decoded.duration * 16_000));
    // OfflineAudioContext 渲染时自动混单声道并重采样到 16k
    const offline = new OfflineAudioContext(1, length, 16_000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(floatToInt16(rendered.getChannelData(0)));
  } finally {
    void ctx.close();
  }
}