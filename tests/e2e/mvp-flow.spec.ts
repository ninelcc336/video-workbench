import { expect, test, type Page } from "@playwright/test";

const defaultProject = {
  effectClips: [],
  export: { format: "mp4", fps: 30, height: 1920, width: 1080 },
  schemaVersion: 1,
  settings: { fps: 30, height: 1920, width: 1080 },
  videoClips: [],
};

/** 中文注释：浏览器验收模拟固定项目库接口，页面无需设置或选择任何本地目录。 */
async function prepareProjectLibrary(page: Page, project = defaultProject) {
  await page.route("**/api/workspace/projects", async (route) => {
    await route.fulfill({ body: JSON.stringify([{ id: "local-project", name: "本地项目" }, { id: "second-project", name: "第二个项目" }]), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/workspace/projects/local-project", async (route) => {
    await route.fulfill({ body: JSON.stringify({ mediaSources: {}, missingMediaIds: [], project }), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/workspace/projects/second-project", async (route) => {
    await route.fulfill({ body: JSON.stringify({ mediaSources: {}, missingMediaIds: [], project: defaultProject }), contentType: "application/json", status: 200 });
  });
}

// 中文注释：首次启动的空状态直接提供项目创建，不暴露目录路径、最近目录或工作区入口。
test("空项目库直接显示新建项目入口", async ({ page }) => {
  await page.route("**/api/workspace/projects", async (route) => {
    await route.fulfill({ body: "[]", contentType: "application/json", status: 200 });
  });
  await page.goto("/");

  await expect(page.getByRole("region", { name: "空项目库" })).toBeVisible();
  await expect(page.getByLabel("新建编辑项目名称")).toBeVisible();
  await expect(page.getByLabel("启动工作区路径")).toHaveCount(0);
  await expect(page.getByText("最近使用")).toHaveCount(0);
});

// 中文注释：浏览器验收覆盖从固定项目库打开项目、添加模板并进入导出的主路径。
test("剪辑小白可以打开编辑项目并添加模板", async ({ page }) => {
  await prepareProjectLibrary(page);
  await page.goto("/");

  await expect(page.getByText("本地视频特效编辑器")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "选择编辑项目" })).toContainText("本地项目");
  await expect(page.getByRole("heading", { name: "特效模板" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导出视频" })).toBeVisible();
  await expect(page.getByText("工作区设置")).toHaveCount(0);

  await page.getByRole("button", { name: "添加弹入卡片" }).click();
  await expect(page.getByRole("button", { name: /弹入卡片/ }).last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "特效参数" })).toBeVisible();

  await page.getByRole("button", { name: "导出视频" }).click();
  await expect(page.getByRole("dialog", { name: "导出视频" })).toBeVisible();
});

// 中文注释：自动保存尚未稳定时取消项目切换，选择器和当前项目必须保留原值。
test("取消项目切换提示后返回当前编辑项目", async ({ page }) => {
  await prepareProjectLibrary(page);
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
  await prepareProjectLibrary(page, { ...defaultProject, export: { format: "mp4", fps: 30, height: 1080, width: 1920 }, settings: { fps: 30, height: 1080, width: 1920 } });
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
  expect(metrics.previewWidth * metrics.previewHeight).toBeGreaterThan(metrics.stageWidth * metrics.stageHeight * 0.8);
  expect(metrics.canvasWidth * metrics.canvasHeight).toBeGreaterThan(metrics.stageWidth * metrics.stageHeight * 0.8);
  expect(metrics.timelineOverflowX).toBe("auto");
  expect(metrics.timelineOverflowY).toBe("auto");
});
