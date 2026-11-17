import { expect, test, type Page } from "@playwright/test";

const FIXED_SCORE = {
  total: 88,
  dimensions: [
    { key: "pace", score: 85, comment: "整体语速平稳" },
    { key: "fillers", score: 90, comment: "填充词很少" },
    { key: "structure", score: 87, comment: "结构清晰" },
    { key: "timing", score: 92, comment: "时间掌控好" },
    { key: "content", score: 84, comment: "内容充实" },
  ],
  suggestions: ["开头可加入一句问候"],
  summary: "一次完成度很高的演练。",
};

const CLOUD_TEXT = "云端精校后的全文";
const LOCAL_TEXT = "本地实时转写内容";

interface Preset {
  ai?: unknown;
}

/** 同 rehearse.spec：bundle 加载前注入 webkitSpeechRecognition 桩 + localStorage 预置 */
async function setupPage(page: Page, preset: Preset = {}) {
  await page.addInitScript((init: Preset) => {
    if (init.ai) {
      localStorage.setItem("pacebox.ai.v1", JSON.stringify(init.ai));
    }

    const esr = {
      instances: [] as unknown[],
      emitResult(text: string, isFinal: boolean) {
        const inst = esr.instances[esr.instances.length - 1] as any;
        if (!inst) return;
        const resultList = {
          0: { transcript: text, confidence: 1 },
          length: 1,
          isFinal,
        };
        inst._dispatch("result", {
          resultIndex: 0,
          results: { 0: resultList, length: 1 },
        });
      },
    };
    (window as any).__esr = esr;

    class FakeSpeechRecognition {
      _listeners = new Map<string, ((ev: unknown) => void)[]>();
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      constructor() {
        esr.instances.push(this);
      }
      addEventListener(name: string, fn: (ev: unknown) => void) {
        if (!this._listeners.has(name)) this._listeners.set(name, []);
        this._listeners.get(name)!.push(fn);
      }
      removeEventListener(name: string, fn: (ev: unknown) => void) {
        const arr = this._listeners.get(name);
        if (arr) {
          this._listeners.set(
            name,
            arr.filter((f) => f !== fn),
          );
        }
      }
      _dispatch(name: string, ev: unknown) {
        const arr = this._listeners.get(name);
        if (!arr) return;
        for (const fn of arr.slice()) fn(ev);
      }
      start() {
        this._dispatch("start", {});
      }
      stop() {
        this._dispatch("end", {});
      }
      abort() {
        this._dispatch("error", { error: "aborted", message: "" });
        this._dispatch("end", {});
      }
    }
    (window as any).webkitSpeechRecognition = FakeSpeechRecognition;
  }, preset);
}

/** 按请求体 model 分流：mimo-v2.5-asr → 精校文本（可配 500），其余 → 固定评分 */
async function interceptAi(page: Page, asrStatus = 200) {
  const state = { asrCalls: 0, scoreCalls: 0, scoreBodies: [] as any[] };
  await page.route("**/chat/completions", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
        },
      });
      return;
    }
    const body = route.request().postDataJSON();
    const headers = {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    };
    if (body?.model === "mimo-v2.5-asr") {
      state.asrCalls += 1;
      if (asrStatus !== 200) {
        await route.fulfill({ status: asrStatus, headers, body: "asr down" });
        return;
      }
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          choices: [{ message: { content: CLOUD_TEXT } }],
        }),
      });
      return;
    }
    state.scoreCalls += 1;
    state.scoreBodies.push(body);
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(FIXED_SCORE) } }],
      }),
    });
  });
  return state;
}

const AI_CONFIG = {
  baseUrl: "https://ai.test/v1",
  apiKey: "sk-e2e",
  model: "e2e-model",
};

/** 开始演练 → 注入本地 final 转写 → 录一小段真实（假设备）音频 → 结束 */
async function runRehearsal(page: Page) {
  await page.getByLabel("开始演练").click();
  await expect(page.getByText("转写中")).toBeVisible({ timeout: 5000 });
  await page.evaluate(
    (text) => (window as any).__esr.emitResult(text, true),
    LOCAL_TEXT,
  );
  // 给 MediaRecorder 留出产出可解码 webm 的时间
  await page.waitForTimeout(1500);
  await page.getByLabel("结束演练").click();
  await page.waitForURL(/\/history\/.+/, { timeout: 15000 });
}

test("开启精校：云端文本替换本地，徽标展示，评分引用云端全文", async ({
  page,
}) => {
  const ai = await interceptAi(page);
  await setupPage(page, {
    ai: { ...AI_CONFIG, asrModel: "mimo-v2.5-asr" },
  });
  await page.goto("/rehearse");
  await runRehearsal(page);

  await expect(page.getByText("云端精校", { exact: true })).toBeVisible();
  await expect(page.getByText(CLOUD_TEXT)).toBeVisible();
  await expect(page.getByText(LOCAL_TEXT)).toHaveCount(0);

  await expect.poll(() => ai.scoreCalls, { timeout: 10000 }).toBe(1);
  expect(ai.asrCalls).toBeGreaterThanOrEqual(1);
  const scoreUserMsg = ai.scoreBodies[0].messages.find(
    (m: any) => m.role === "user",
  );
  expect(scoreUserMsg.content).toContain(CLOUD_TEXT);
});

test("ASR 500：整体回退本地转写并提示失败原因", async ({ page }) => {
  const ai = await interceptAi(page, 500);
  await setupPage(page, {
    ai: { ...AI_CONFIG, asrModel: "mimo-v2.5-asr" },
  });
  await page.goto("/rehearse");
  await runRehearsal(page);

  await expect(
    page.getByText(/云端精校失败，已使用本地转写/),
  ).toBeVisible();
  await expect(page.getByText(LOCAL_TEXT)).toBeVisible();
  await expect(page.getByText("云端精校", { exact: true })).toHaveCount(0);
  await expect.poll(() => ai.scoreCalls, { timeout: 10000 }).toBe(1);
});

test("精校关闭：零 ASR 请求，本地转写直接入库", async ({ page }) => {
  const ai = await interceptAi(page);
  await setupPage(page, { ai: { ...AI_CONFIG, asrModel: "" } });
  await page.goto("/rehearse");
  await runRehearsal(page);

  await expect(page.getByText(LOCAL_TEXT)).toBeVisible();
  await expect(page.getByText("云端精校", { exact: true })).toHaveCount(0);
  await expect.poll(() => ai.scoreCalls, { timeout: 10000 }).toBe(1);
  expect(ai.asrCalls).toBe(0);
});