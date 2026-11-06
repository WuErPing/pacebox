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
  suggestions: ["开头可加入一句问候", "结尾用总结收束"],
  summary: "一次完成度很高的演练。",
};

interface Preset {
  settings?: unknown;
  ai?: unknown;
  history?: unknown;
}

/**
 * 注入 webkitSpeechRecognition 桩（在 bundle 加载前）+ 可选 localStorage 预置。
 * AsyncStorage web 端使用裸 key，故直接写 localStorage。
 */
async function setupPage(page: Page, preset: Preset = {}) {
  await page.addInitScript((init: Preset) => {
    if (init.settings) {
      localStorage.setItem("pacebox.settings.v1", JSON.stringify(init.settings));
    }
    if (init.ai) {
      localStorage.setItem("pacebox.ai.v1", JSON.stringify(init.ai));
    }
    if (init.history) {
      localStorage.setItem(
        "pacebox.history.index.v1",
        JSON.stringify(init.history),
      );
    }

    // ESR web 在模块加载时捕获 window.webkitSpeechRecognition，故须先于 bundle 定义
    const esr = {
      instances: [] as unknown[],
      starts: 0,
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
      emitEnd() {
        const inst = esr.instances[esr.instances.length - 1] as any;
        if (!inst) return;
        inst._dispatch("end", {});
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
        esr.starts += 1;
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

/** 拦截 OpenAI 兼容 /chat/completions，返回固定评分并计数（含 CORS 预检处理） */
async function interceptAi(page: Page) {
  const state = { calls: 0 };
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
    state.calls += 1;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
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

test("首页预设 chip 点击生效并持久化", async ({ page }) => {
  await setupPage(page);
  await page.goto("/");

  await page.getByLabel("主题演讲 20 分钟").click();
  await expect(page.getByText("20:00", { exact: true })).toBeVisible();

  const stored = await page.evaluate(() =>
    localStorage.getItem("pacebox.settings.v1"),
  );
  expect(stored).toContain('"totalMinutes":20');
});

test("演练全流程：实时转写 → 结束 → 报告页指标与 AI 评分", async ({
  page,
}) => {
  const ai = await interceptAi(page);
  await setupPage(page, { ai: AI_CONFIG });
  await page.goto("/rehearse");

  await page.getByLabel("开始演练").click();
  await expect(page.getByText("转写中")).toBeVisible({ timeout: 5000 });

  // 注入 interim → final
  await page.evaluate(() => (window as any).__esr.emitResult("大家好", false));
  await expect(page.getByText("大家好")).toBeVisible();
  await page.evaluate(() =>
    (window as any).__esr.emitResult("大家好，今天讲讲配速", true),
  );

  await page.getByLabel("结束演练").click();
  await page.waitForURL(/\/history\/.+/, { timeout: 10000 });

  // 报告页：完整转写渲染
  await expect(page.getByText("完整转写")).toBeVisible();
  await expect(page.getByText(/大家好，今天讲讲配速/)).toBeVisible();

  // AI 自动评分恰好一次，结果渲染
  await expect.poll(() => ai.calls, { timeout: 10000 }).toBe(1);
  await expect(page.getByText("一次完成度很高的演练。")).toBeVisible();
  await expect(page.getByText("改进建议")).toBeVisible();

  // 历史 index 恰有 1 条
  const indexLen = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("pacebox.history.index.v1") || "[]")
        .length,
  );
  expect(indexLen).toBe(1);
});

test("转写 end 后自动重启（新建识别实例）", async ({ page }) => {
  await setupPage(page);
  await page.goto("/rehearse");

  await page.getByLabel("开始演练").click();
  await expect(page.getByText("转写中")).toBeVisible({ timeout: 5000 });

  const before = await page.evaluate(
    () => (window as any).__esr.instances.length as number,
  );
  await page.evaluate(() => (window as any).__esr.emitEnd());

  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as any).__esr.instances.length as number),
      { timeout: 5000 },
    )
    .toBe(before + 1);
});

test("未配置 AI：报告页显示「前往设置」且不发评分请求", async ({ page }) => {
  const ai = await interceptAi(page);
  await setupPage(page); // 不预置 ai 配置
  await page.goto("/rehearse");

  await page.getByLabel("开始演练").click();
  await expect(page.getByText("转写中")).toBeVisible({ timeout: 5000 });
  await page.evaluate(() =>
    (window as any).__esr.emitResult("测试内容", true),
  );

  await page.getByLabel("结束演练").click();
  await page.waitForURL(/\/history\/.+/, { timeout: 10000 });

  await expect(page.getByLabel("前往设置")).toBeVisible();
  expect(ai.calls).toBe(0);
});

test("历史淘汰：预置 20 条后新演练仍 20 条且最旧被删", async ({ page }) => {
  const old = Array.from({ length: 20 }, (_, i) => ({
    id: `old-${i}`,
    startedAt: 1700000000000 + i * 60000,
  }));
  await setupPage(page, { history: old });
  await page.goto("/rehearse");

  await page.getByLabel("开始演练").click();
  await expect(page.getByText("转写中")).toBeVisible({ timeout: 5000 });
  await page.evaluate(() =>
    (window as any).__esr.emitResult("淘汰测试", true),
  );

  await page.getByLabel("结束演练").click();
  await page.waitForURL(/\/history\/.+/, { timeout: 10000 });

  const idx = (await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pacebox.history.index.v1") || "[]"),
  )) as { id: string }[];
  expect(idx).toHaveLength(20);
  expect(idx.some((e) => e.id === "old-0")).toBe(false);
  expect(idx.some((e) => e.id === "old-19")).toBe(true);
  expect(idx.some((e) => !e.id.startsWith("old-"))).toBe(true);
});

test("完成一次后再次进入演练模式应为全新一轮，不误跳历史", async ({
  page,
}) => {
  await setupPage(page);
  await page.goto("/");
  await page.getByLabel("演练模式").click();
  await expect(page).toHaveURL(/\/rehearse$/);

  await page.getByLabel("开始演练").click();
  await expect(page.getByText("转写中")).toBeVisible({ timeout: 5000 });
  await page.evaluate(() =>
    (window as any).__esr.emitResult("第一轮", true),
  );
  await page.getByLabel("结束演练").click();
  await page.waitForURL(/\/history\/.+/, { timeout: 10000 });

  // SPA 后退返回首页（不刷新，保留内存态），再次进入演练模式
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel("演练模式").click();

  // 应为全新一轮：停留在演练页并显示开始按钮，而非重定向到上一条历史
  await expect(page.getByLabel("开始演练")).toBeVisible({ timeout: 5000 });
  await expect(page).not.toHaveURL(/\/history\//);
});
