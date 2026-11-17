/** native 录音产物已是 WAV，无需浏览器解码；误调用即报错 */
export async function decodeAudioBlobToWav16k(_blob: Blob): Promise<Uint8Array> {
  throw new Error("native 端不应调用浏览器音频解码");
}