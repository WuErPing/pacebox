import { afterEach, describe, expect, it, vi } from "vitest";

import { AiRequestError } from "@/lib/ai-scoring";
import { asrLanguage, transcribeChunk } from "@/lib/mimo-asr";
import { encodeWav } from "@/lib/wav";
import type { AiConfig } from "@/store/ai-config";

afterEach(() => {
  vi.unstubAllGlobals();
});

const CFG: AiConfig = {
  baseUrl: "https://mimo.test/v1",
  apiKey: "sk-mimo",
  model: "mimo-v2.6-flash",
  asrModel: "mimo-v2.5-asr",
};

const WAV = encodeWav(new Int16Array([100, -100, 0]));

function stubFetch(payload: unknown) {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("asrLanguage", () => {
  it("zh-* → zh，en-* → en，其余 auto", () => {
    expect(asrLanguage("zh-CN")).toBe("zh");
    expect(asrLanguage("en-US")).toBe("en");
    expect(asrLanguage("ja-JP")).toBe("auto");
    expect(asrLanguage("")).toBe("auto");
  });
});

describe("transcribeChunk", () => {
  it("请求体符合 MiMo input_audio 协议，Bearer 鉴权", async () => {
    const fn = stubFetch({ choices: [{ message: { content: " 云端文本 " } }] });
    const text = await transcribeChunk(CFG, WAV, "zh-CN");
    expect(text).toBe("云端文本");

    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://mimo.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-mimo",
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("mimo-v2.5-asr");
    expect(body.stream).toBe(false);
    expect(body.asr_options).toEqual({ language: "zh" });
    expect(body.messages[0].role).toBe("user");
    const part = body.messages[0].content[0];
    expect(part.type).toBe("input_audio");
    expect(part.input_audio.data.startsWith("data:audio/wav;base64,")).toBe(true);
  });

  it("en-US 映射 asr_options.language=en", async () => {
    const fn = stubFetch({ choices: [{ message: { content: "hello" } }] });
    await transcribeChunk(CFG, WAV, "en-US");
    const body = JSON.parse(
      (fn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.asr_options.language).toBe("en");
  });

  it("静音片空文本合法返回空串", async () => {
    stubFetch({ choices: [{ message: { content: "   " } }] });
    expect(await transcribeChunk(CFG, WAV, "zh-CN")).toBe("");
  });

  it("配置不全（asrModel 空）抛 config 且不发请求", async () => {
    const fn = stubFetch({});
    await expect(
      transcribeChunk({ ...CFG, asrModel: "" }, WAV, "zh-CN"),
    ).rejects.toMatchObject({ kind: "config" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("401 抛 http 错误并提示 API Key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("invalid key", { status: 401 })),
    );
    await expect(transcribeChunk(CFG, WAV, "zh-CN")).rejects.toMatchObject({
      kind: "http",
      status: 401,
    });
    await expect(transcribeChunk(CFG, WAV, "zh-CN")).rejects.toThrow(/API Key/);
  });

  it("网络异常抛 network 错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(transcribeChunk(CFG, WAV, "zh-CN")).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("响应缺 content 抛 parse 错误", async () => {
    stubFetch({ choices: [] });
    await expect(transcribeChunk(CFG, WAV, "zh-CN")).rejects.toBeInstanceOf(
      AiRequestError,
    );
    stubFetch({ choices: [{ message: {} }] });
    await expect(transcribeChunk(CFG, WAV, "zh-CN")).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it("外部 abort 原样抛 AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError");
      }),
    );
    await expect(
      transcribeChunk(CFG, WAV, "zh-CN", AbortSignal.abort()),
    ).rejects.toBeInstanceOf(DOMException);
  });
});