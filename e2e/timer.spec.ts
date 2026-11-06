import { expect, test } from "@playwright/test";

// 缺省用例固定英文环境；中文环境的语音提示另用 describe 覆盖
test.use({ locale: "en-US" });

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  // 默认隔离本机通知服务，保证断言走浏览器回退路径；服务端优先链路由单独用例覆盖
  await page.route("http://127.0.0.1:39527/**", (route) => route.abort());
  await page.addInitScript(() => {
    // 记录通知与语音调用，供断言
    (window as any).__notifications = [];
    (window as any).__spoken = [];
    const OriginalNotification = window.Notification;
    (window as any).Notification = class extends OriginalNotification {
      constructor(title: string, options?: NotificationOptions) {
        super(title, options);
        (window as any).__notifications.push({ title, body: options?.body });
      }
      static override get permission(): NotificationPermission {
        return "granted";
      }
      static override async requestPermission() {
        return "granted" as const;
      }
    };

    class FakeSpeechSynthesisUtterance {
      text = "";
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice = null;
      onstart = null;
      onend = null;
      onerror = null;
      onpause = null;
      onresume = null;
      onmark = null;
      onboundary = null;
      constructor(text?: string) {
        if (text) this.text = text;
      }
    }
    (window as any).SpeechSynthesisUtterance = FakeSpeechSynthesisUtterance;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak(utterance: { text: string; lang: string }) {
          (window as any).__spoken.push({
            text: utterance.text,
            lang: utterance.lang,
          });
        },
        cancel() {},
        pause() {},
        resume() {},
        getVoices() {
          return [];
        },
        speaking: false,
        pending: false,
        paused: false,
        onvoiceschanged: null,
      },
    });
  });
});

test("默认界面即有 25 分钟计时器，点开始立即计时", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("25:00", { exact: true })).toBeVisible();
  await expect(page.getByText(/总时长 25 分钟/)).toBeVisible();
  await expect(page.getByText(/第一次提醒 12:30/)).toBeVisible();
  await expect(page.getByText(/第二次提醒 18:45/)).toBeVisible();

  await page.getByLabel("开始").click();
  await expect(page.getByText("计时中")).toBeVisible();
  await expect(page.getByText("24:59")).toBeVisible({ timeout: 3000 });

  await page.getByLabel("暂停").click();
  await expect(page.getByText("已暂停")).toBeVisible();
});

test("到点触发语音提示与系统通知", async ({ page }) => {
  // 预置设置：1 分钟总时长，2% / 5% 提醒（约 1.2s / 3s）
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "pacebox.settings.v1",
      JSON.stringify({ totalMinutes: 1, firstReminderPct: 2, secondReminderPct: 5 }),
    );
  });
  await page.goto("/");
  await page.getByLabel("开始").click();

  await expect
    .poll(async () =>
      page.evaluate(() => (window as any).__notifications.map((n: any) => n.title)),
    )
    .toEqual(["First reminder", "Second reminder"]);

  await expect
    .poll(async () =>
      page.evaluate(() => (window as any).__spoken.map((s: any) => s.text)),
    )
    .toEqual(["First reminder", "Second reminder"]);
  const languages = await page.evaluate(() => [
    ...new Set((window as any).__spoken.map((s: any) => s.lang)),
  ]);
  expect(languages).toEqual(["en-US"]);
});

test("本机通知服务可用时测试提醒走 osascript 通道", async ({ page }) => {
  const notifyCalls: { title: string; body: string }[] = [];
  await page.route("http://127.0.0.1:39527/health", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({ ok: true, platform: "darwin" }),
    });
  });
  await page.route("http://127.0.0.1:39527/notify", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
      return;
    }
    notifyCalls.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/settings");
  await page.getByLabel("测试提醒").click();

  await expect.poll(() => notifyCalls.length).toBe(1);
  expect(notifyCalls[0]).toEqual({
    title: "Pacebox test notification",
    body: "Voice prompt and system notifications are working",
  });
  await expect(page.getByText(/已弹出测试通知/)).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as any).__spoken.map((s: any) => s.text)),
    )
    .toEqual(["Voice prompt is working"]);

  // 服务端已接管，不应再弹浏览器通知
  const browserNotifications = await page.evaluate(
    () => (window as any).__notifications.length,
  );
  expect(browserNotifications).toBe(0);
});

test("一分钟计时器：00:30 / 00:45 / 01:00 三次提醒并自动结束", async ({
  page,
}) => {
  // 1 分钟 + 缺省 50% / 75%：第一次 00:30，第二次 00:45，结束 01:00
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "pacebox.settings.v1",
      JSON.stringify({ totalMinutes: 1, firstReminderPct: 50, secondReminderPct: 75 }),
    );
  });
  await page.goto("/");

  await expect(page.getByText("01:00", { exact: true })).toBeVisible();
  await expect(page.getByText(/第一次提醒 00:30/)).toBeVisible();
  await expect(page.getByText(/第二次提醒 00:45/)).toBeVisible();

  // 首屏渲染完成后接管时钟，推进 60 秒验证完整提醒链路
  await page.clock.install();
  await page.getByLabel("开始").click();
  await expect(page.getByText("计时中")).toBeVisible();

  const titles = () =>
    page.evaluate(() =>
      (window as any).__notifications.map((n: any) => n.title),
    );

  await page.clock.fastForward(30_000);
  await expect.poll(titles).toEqual(["First reminder"]);

  await page.clock.fastForward(15_000);
  await expect.poll(titles).toEqual(["First reminder", "Second reminder"]);

  await page.clock.fastForward(15_000);
  await expect.poll(titles).toEqual(["First reminder", "Second reminder", "Time's up"]);

  await expect(page.getByText("时间到", { exact: true })).toBeVisible();
  await expect(page.getByText("00:00", { exact: true })).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() => (window as any).__spoken.map((s: any) => s.text)),
    )
    .toEqual(["First reminder", "Second reminder", "Time's up"]);
});

test.describe("中文环境", () => {
  test.use({ locale: "zh-CN" });

  test("提醒语音使用中文", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "pacebox.settings.v1",
        JSON.stringify({ totalMinutes: 1, firstReminderPct: 2, secondReminderPct: 5 }),
      );
    });
    await page.goto("/");
    await page.getByLabel("开始").click();

    await expect
      .poll(async () =>
        page.evaluate(() => (window as any).__spoken.map((s: any) => s.text)),
      )
      .toEqual(["第一次提醒", "第二次提醒"]);

    await expect
      .poll(async () =>
        page.evaluate(() =>
          (window as any).__notifications.map((n: any) => n.title),
        ),
      )
      .toEqual(["第一次提醒", "第二次提醒"]);

    const languages = await page.evaluate(() => [
      ...new Set((window as any).__spoken.map((s: any) => s.lang)),
    ]);
    expect(languages).toEqual(["zh-CN"]);
  });
});

test("设置页可修改总时长并持久化", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("设置").click();

  const input = page.getByLabel("总时长");
  await expect(input).toBeVisible();
  await input.fill("10");
  await input.blur();

  await expect(page.getByText(/第一次提醒：05:00/)).toBeVisible();
  await expect(page.getByText(/第二次提醒：07:30/)).toBeVisible();

  const stored = await page.evaluate(() => window.localStorage.getItem("pacebox.settings.v1"));
  expect(stored).toContain('"totalMinutes":10');

  await page.goBack();
  await expect(page.getByText("10:00", { exact: true })).toBeVisible();
});
