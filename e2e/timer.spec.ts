import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(() => {
    // 记录通知与铃声调用，供断言
    (window as any).__notifications = [];
    (window as any).__plays = 0;
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
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play() {
      (window as any).__plays += 1;
      return originalPlay.call(this);
    };
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

test("到点触发响铃与系统通知", async ({ page }) => {
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
    .toEqual(["第一次提醒", "第二次提醒"]);

  const plays = await page.evaluate(() => (window as any).__plays);
  expect(plays).toBeGreaterThanOrEqual(2);
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
