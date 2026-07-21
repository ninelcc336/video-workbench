import { expect, test, type Page } from "@playwright/test";

const defaultProject = {
  effectClips: [],
  export: { format: "mp4", fps: 30, height: 1920, width: 1080 },
  schemaVersion: 1,
  settings: { fps: 30, height: 1920, width: 1080 },
  videoClips: [],
};

/** 中文注释：浏览器测试显式提供已打开的本地工作区，避免重新引入首次启动自动创建默认工作区的旧行为。 */
async function prepareEditorWorkspace(page: Page, project = defaultProject) {
  await page.route("**/api/workspace/recent", async (route) => {
    await route.fulfill({ body: JSON.stringify([{ lastOpenedAt: "2026-07-22T00:00:00.000Z", name: "验收工作区", rootPath: "D:/验收工作区" }]), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/workspace/projects", async (route) => {
    await route.fulfill({ body: JSON.stringify([{ id: "local-project", name: "本地项目" }, { id: "second-project", name: "第二个项目" }]), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/workspace/projects/local-project", async (route) => {
    await route.fulfill({ body: JSON.stringify({ mediaSources: {}, missingMediaIds: [], project }), contentType: "application/json", status: 200 });
  });
}

// 中文注释：首次启动没有最近工作区时先停在启动页，不静默创建默认工作区或编辑项目。
test("首次启动要求用户选择本地工作区", async ({ page }) => {
  await page.route("**/api/workspace/recent", async (route) => {
    await route.fulfill({ body: "[]", contentType: "application/json", status: 200 });
  });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "启动页" })).toBeVisible();
  await expect(page.getByLabel("启动工作区路径")).toBeVisible();
});

// 中文注释：浏览器验收覆盖新手从打开编辑器到添加模板和进入导出的主路径。
test("剪辑小白可以打开编辑器并添加模板", async ({ page }) => {
  await prepareEditorWorkspace(page);
  await page.goto("/");

  await expect(page.getByText("本地视频特效编辑器")).toBeVisible();
  await expect(page.getByRole("heading", { name: "特效模板" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导出视频" })).toBeVisible();

  await page.getByRole("button", { name: "添加弹入卡片" }).click();
  await expect(page.getByRole("button", { name: /弹入卡片/ }).last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "特效参数" })).toBeVisible();

  await page.getByRole("button", { name: "导出视频" }).click();
  await expect(page.getByRole("dialog", { name: "导出视频" })).toBeVisible();
});

// 中文注释：工作区打开失败时，当前编辑器仍应可见，并提供明确的重试与返回入口。
test("工作区打开失败不会静默替换当前编辑项目", async ({ page }) => {
  await prepareEditorWorkspace(page);
  await page.route("**/api/workspace/open", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ code: "workspace_error", message: "工作区目录无法访问" }),
      contentType: "application/json",
      status: 500,
    });
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");

  await page.getByRole("button", { name: "设置" }).click();
  await page.getByLabel("工作区路径").fill("D:/无法访问的工作区");
  await page.getByRole("button", { name: "打开工作区" }).click();

  await expect(page.getByRole("alert", { name: "工作区错误" })).toContainText("工作区目录无法访问");
  await expect(page.getByRole("button", { name: "导出视频" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(page.getByRole("button", { name: "返回编辑" })).toBeVisible();
});

// 中文注释：项目选择被取消时不发起加载请求，当前项目选择仍保持不变。
test("取消项目切换提示后返回当前编辑项目", async ({ page }) => {
  await prepareEditorWorkspace(page);
  await page.goto("/");

  await page.getByRole("button", { name: "添加弹入卡片" }).click();
  const projectSelect = page.getByRole("combobox", { name: "选择编辑项目" });
  await projectSelect.click();
  await page.getByRole("option", { name: "第二个项目" }).click();

  await expect(page.getByRole("alertdialog")).toContainText("继续切换到“second-project”？");
  await page.getByRole("button", { name: "返回编辑" }).click();
  await expect(projectSelect).toContainText("本地项目");
});

test("横屏项目保持画布方向且页面溢出由时间轴容器承接", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await prepareEditorWorkspace(page, { ...defaultProject, export: { format: "mp4", fps: 30, height: 1080, width: 1920 }, settings: { fps: 30, height: 1080, width: 1920 } });
  await page.goto("/");

  await expect(page.getByLabel("画布方向：横屏")).toBeVisible();
  const metrics = await page.evaluate(() => {
    const preview = document.querySelector(".preview-device")?.getBoundingClientRect();
    const canvas = document.querySelector(".preview-device__canvas")?.getBoundingClientRect();
    const timeline = document.querySelector(".timeline-scroll");
    const timelineStyle = timeline ? getComputedStyle(timeline) : null;
    return {
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      canvasHeight: canvas?.height ?? 0,
      canvasWidth: canvas?.width ?? 0,
      stageHeight: document.querySelector(".preview-stage")?.getBoundingClientRect().height ?? 0,
      stageWidth: document.querySelector(".preview-stage")?.getBoundingClientRect().width ?? 0,
      previewHeight: preview?.height ?? 0,
      previewWidth: preview?.width ?? 0,
      timelineOverflowX: timelineStyle?.overflowX,
      timelineOverflowY: timelineStyle?.overflowY,
    };
  });

  // 中文注释：1080p 视口不应出现页面级滚动，时间轴保留自己的双向滚动边界。
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.innerHeight);
  expect(metrics.previewWidth).toBeGreaterThan(metrics.previewHeight);
  expect(metrics.previewWidth * metrics.previewHeight).toBeGreaterThan(
    metrics.stageWidth * metrics.stageHeight * 0.8,
  );
  expect(metrics.canvasWidth * metrics.canvasHeight).toBeGreaterThan(
    metrics.stageWidth * metrics.stageHeight * 0.8,
  );
  expect(metrics.timelineOverflowX).toBe("auto");
  expect(metrics.timelineOverflowY).toBe("auto");
});
