import { expect, test } from "@playwright/test";

test("剪辑小白可以打开编辑器并添加模板", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("本地视频特效编辑器")).toBeVisible();
  await expect(page.getByText("特效模板")).toBeVisible();
  await expect(page.getByRole("button", { name: "导出视频" })).toBeVisible();

  await page.getByRole("button", { name: "添加弹入卡片" }).click();
  await expect(page.getByRole("button", { name: /弹入卡片/ }).last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "特效参数" })).toBeVisible();

  await page.getByRole("button", { name: "导出视频" }).click();
  await expect(page.getByRole("dialog", { name: "导出视频" })).toBeVisible();
});
