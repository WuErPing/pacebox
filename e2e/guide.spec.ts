import { expect, test } from "@playwright/test";

test("首页可进入演讲指南并查看演讲与身体语言建议", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("演讲指南").click();

  await expect(page).toHaveURL(/\/guide$/);
  await expect(
    page.getByRole("heading", { name: "先站稳，再开口。" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "演讲要点", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("只留一个核心信息", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "经典身体语言", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("眼神停留，而非扫视", { exact: true })).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "名人示范：一次只学一个动作" }),
  ).toBeVisible();
  const photos = [
    ["乔布斯在 iPhone 发布会上伸出手掌的真人照片", "Acaben"],
    ["奥巴马在演讲中抬手强调的真人照片", "Chad Davis"],
    ["奥普拉手心向上打开双臂的真人照片", "Alan Light"],
  ];
  for (const [name, author] of photos) {
    const photo = page.getByRole("img", { name });
    await expect(photo).toBeVisible();
    expect(
      await photo.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    ).toBe(true);
    await expect(page.getByText(new RegExp(`照片：${author}`))).toBeVisible();
  }
  await expect(page.getByText("乔布斯｜V 字打开手势", { exact: true })).toBeVisible();
  await expect(page.getByText("奥巴马｜小幅度强调", { exact: true })).toBeVisible();
  await expect(page.getByText("奥普拉｜开放双臂", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "乔布斯 V 字打开手势动作图" }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "西瓜手势：先定位，再切分" }),
  ).toBeVisible();
  for (const [index, name] of ["抱个西瓜", "横切西瓜", "竖劈西瓜"].entries()) {
    await expect(page.getByText(`${index + 1}. ${name}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: `${name}动作图` })).toBeVisible();
  }

  const watermelonPhotos = [
    ["TED 演讲者双手在腹前围合的照片", "16.0s"],
    ["TED 演讲者水平切分手势的照片", "14.0s"],
    ["TED 演讲者向下切分手势的照片", "10.75s"],
  ];
  for (const [name, time] of watermelonPhotos) {
    const photo = page.getByRole("img", { name });
    await expect(photo).toBeVisible();
    expect(
      await photo.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    ).toBe(true);
    await expect(
      page.getByText(`视频：Pexels / TED（${time} 截帧）`, { exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByText(/均来自真实演讲视频截帧/)).toBeVisible();
});
