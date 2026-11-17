import { expect, test, type Page } from "@playwright/test";

async function readAiConfig(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("pacebox.ai.v1") || "{}"),
  );
}

test("服务商预设：小米 MiMo 一键切换 baseUrl+model，保留 apiKey", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // reload 时不覆盖已持久化的配置
    if (localStorage.getItem("pacebox.ai.v1")) return;
    localStorage.setItem(
      "pacebox.ai.v1",
      JSON.stringify({
        baseUrl: "http://localhost:1234/v1",
        apiKey: "sk-keep",
        model: "qwen3.6-35b-a3b-splash",
        asrModel: "",
      }),
    );
  });
  await page.goto("/settings");

  await expect(page.getByLabel("本地 LM Studio")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByLabel("小米 MiMo").click();

  await expect
    .poll(async () => (await readAiConfig(page)).baseUrl)
    .toBe("https://token-plan-cn.xiaomimimo.com/v1");
  const cfg = await readAiConfig(page);
  expect(cfg.model).toBe("mimo-v2.6-flash");
  expect(cfg.apiKey).toBe("sk-keep");

  // reload 后高亮保持
  await page.reload();
  await expect(page.getByLabel("小米 MiMo")).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("模型 chips 与自定义输入互通并持久化", async ({ page }) => {
  await page.goto("/settings");

  await page.getByLabel("mimo-v2.6-flash", { exact: true }).click();
  await expect
    .poll(async () => (await readAiConfig(page)).model)
    .toBe("mimo-v2.6-flash");
  await expect(page.getByLabel("模型（可自定义）")).toHaveValue(
    "mimo-v2.6-flash",
  );

  const input = page.getByLabel("模型（可自定义）");
  await input.fill("my-custom-model");
  await input.blur();
  await expect
    .poll(async () => (await readAiConfig(page)).model)
    .toBe("my-custom-model");
  await expect(
    page.getByLabel("mimo-v2.6-flash", { exact: true }),
  ).toHaveAttribute("aria-selected", "false");
});

test("云端精校开关：开启/关闭持久化，reload 高亮保持", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByLabel("关闭", { exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByLabel("mimo-v2.5-asr", { exact: true }).click();
  await expect
    .poll(async () => (await readAiConfig(page)).asrModel)
    .toBe("mimo-v2.5-asr");

  await page.reload();
  await expect(
    page.getByLabel("mimo-v2.5-asr", { exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  await page.getByLabel("关闭", { exact: true }).click();
  await expect
    .poll(async () => (await readAiConfig(page)).asrModel)
    .toBe("");
});