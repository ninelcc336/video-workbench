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
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({ body: JSON.stringify([{ id: "local-project", name: "本地项目" }, { id: "second-project", name: "第二个项目" }]), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/workspaces/local-project", async (route) => {
    await route.fulfill({ body: JSON.stringify({ mediaSources: {}, missingMediaIds: [], workspace: project }), contentType: "application/json", status: 200 });
  });
  await page.route("**/api/workspaces/second-project", async (route) => {
    await route.fulfill({ body: JSON.stringify({ mediaSources: {}, missingMediaIds: [], workspace: defaultProject }), contentType: "application/json", status: 200 });
  });
}

type BrowserWorkspace = {
  name: string;
  project: typeof defaultProject;
  media: Array<{ id: string; originalName: string; fileName: string; relativePath: string; mimeType: string; sizeBytes: number; importedAt: string; durationInSeconds: number; width: number; height: number; fps: number }>;
};
type IsolatedWorkspaceLibrary = { library: Map<string, BrowserWorkspace>; renderedWorkspaceIds: string[] };

/** 中文注释：搭建与新工作区 API 形状一致的浏览器内存库，验收页面真实发出的 A/B 请求而非只检查静态文案。 */
async function prepareIsolatedWorkspaceLibrary(page: Page): Promise<IsolatedWorkspaceLibrary> {
  const library = new Map<string, BrowserWorkspace>();
  const renderedWorkspaceIds: string[] = [];
  await page.addInitScript(() => {
    // 中文注释：E2E 使用极小伪视频文件；浏览器端元数据读取固定为可验证的横屏尺寸，网络请求仍走真实页面逻辑。
    Object.defineProperties(HTMLVideoElement.prototype, {
      duration: { configurable: true, get: () => 1 },
      videoHeight: { configurable: true, get: () => 1080 },
      videoWidth: { configurable: true, get: () => 1920 },
    });
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() { return descriptor?.get?.call(this) ?? ""; },
      set(value: string) {
        descriptor?.set?.call(this, value);
        queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
      },
    });
  });
  await page.route("**/api/workspaces**", async (route) => {
    const request = route.request();
    const segments = new URL(request.url()).pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const workspaceId = segments[2];
    const resource = segments[3];
    if (segments.length === 2 && request.method() === "GET") {
      await route.fulfill({ body: JSON.stringify([...library.entries()].map(([id, workspace]) => ({ id, name: workspace.name }))), contentType: "application/json", status: 200 });
      return;
    }
    if (!workspaceId) {
      await route.fulfill({ status: 404 });
      return;
    }
    if (segments.length === 3 && request.method() === "POST") {
      library.set(workspaceId, { media: [], name: workspaceId, project: JSON.parse(request.postData() ?? JSON.stringify(defaultProject)) as typeof defaultProject });
      await route.fulfill({ body: JSON.stringify({ ok: true }), contentType: "application/json", status: 201 });
      return;
    }
    const workspace = library.get(workspaceId);
    if (!workspace) {
      await route.fulfill({ status: 404 });
      return;
    }
    if (segments.length === 3 && request.method() === "GET") {
      const mediaSources = Object.fromEntries(workspace.project.videoClips.map((clip) => [clip.mediaId, `/api/workspaces/${encodeURIComponent(workspaceId)}/media/${encodeURIComponent(clip.mediaId)}`]));
      await route.fulfill({ body: JSON.stringify({ mediaSources, missingMediaIds: [], workspace: workspace.project }), contentType: "application/json", status: 200 });
      return;
    }
    if (segments.length === 3 && request.method() === "PUT") {
      workspace.project = JSON.parse(request.postData() ?? JSON.stringify(defaultProject)) as typeof defaultProject;
      await route.fulfill({ body: JSON.stringify({ ok: true }), contentType: "application/json", status: 200 });
      return;
    }
    if (segments.length === 3 && request.method() === "PATCH") {
      const body = JSON.parse(request.postData() ?? "{}") as { name?: string };
      workspace.name = body.name ?? workspace.name;
      await route.fulfill({ body: JSON.stringify({ id: workspaceId, name: workspace.name, ok: true }), contentType: "application/json", status: 200 });
      return;
    }
    if (resource === "media" && segments.length === 4 && request.method() === "GET") {
      await route.fulfill({ body: JSON.stringify(workspace.media), contentType: "application/json", status: 200 });
      return;
    }
    if (resource === "media" && segments.length === 4 && request.method() === "POST") {
      const asset = {
        durationInSeconds: 1,
        fileName: `media-${workspace.media.length + 1}.mp4`,
        fps: 30,
        height: 1080,
        id: `media-${workspaceId}-${workspace.media.length + 1}`,
        importedAt: "2026-07-23T00:00:00.000Z",
        mimeType: "video/mp4",
        originalName: workspaceId === "视频 A" ? "A 的素材.mp4" : "B 的素材.mp4",
        relativePath: "media/private.mp4",
        sizeBytes: 16,
        width: 1920,
      };
      workspace.media.push(asset);
      await route.fulfill({ body: JSON.stringify(asset), contentType: "application/json", status: 201 });
      return;
    }
    await route.fulfill({ status: 404 });
  });
  await page.route("**/api/render**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 404 });
      return;
    }
    const request = JSON.parse(route.request().postData() ?? "{}") as { project?: typeof defaultProject; workspaceId?: string };
    const workspaceId = request.workspaceId ?? "unknown";
    renderedWorkspaceIds.push(workspaceId);
    await route.fulfill({
      body: JSON.stringify({
        jobId: `render-${renderedWorkspaceIds.length}`,
        snapshot: {
          outputPath: `video-workspaces/${workspaceId}/renders/export.mp4`,
          project: request.project ?? defaultProject,
          status: "completed",
        },
      }),
      contentType: "application/json",
      status: 202,
    });
  });
  return { library, renderedWorkspaceIds };
}

// 中文注释：首次启动的空状态直接提供项目创建，不暴露目录路径、最近目录或工作区入口。
test("空项目库直接显示新建项目入口", async ({ page }) => {
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({ body: "[]", contentType: "application/json", status: 200 });
  });
  await page.goto("/");

  await expect(page.getByRole("region", { name: "空工作区库" })).toBeVisible();
  await expect(page.getByLabel("新建视频工作区名称")).toBeVisible();
  await expect(page.getByLabel("启动工作区路径")).toHaveCount(0);
  await expect(page.getByText("最近使用")).toHaveCount(0);
});

// 中文注释：浏览器验收覆盖从固定项目库打开项目、添加模板并进入导出的主路径。
test("剪辑小白可以打开编辑项目并添加模板", async ({ page }) => {
  await prepareProjectLibrary(page);
  await page.goto("/");

  await expect(page.getByText("本地视频特效编辑器")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "选择视频工作区" })).toContainText("本地项目");
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
  const projectSelect = page.getByRole("combobox", { name: "选择视频工作区" });
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

// 中文注释：真实浏览器操作覆盖 A/B 创建、各自导入、保存后切回，防止再次回退为共享素材列表。
test("视频工作区 A 与 B 的素材和时间轴在切换后保持隔离", async ({ page }) => {
  const { library, renderedWorkspaceIds } = await prepareIsolatedWorkspaceLibrary(page);
  await page.goto("/");

  await page.getByLabel("新建视频工作区名称").fill("视频 A");
  await page.getByRole("button", { name: "新建视频工作区" }).click();
  await expect(page.getByRole("combobox", { name: "选择视频工作区" })).toContainText("视频 A");
  await page.locator('input[type="file"]').first().setInputFiles({ buffer: Buffer.from("video A"), mimeType: "video/mp4", name: "A 的素材.mp4" });
  await expect(page.getByText("A 的素材.mp4").first()).toBeVisible();
  await expect(page.getByLabel("保存状态")).toContainText("已自动保存");
  await page.getByRole("button", { name: "导出视频" }).click();
  await page.getByRole("button", { name: "开始导出" }).click();
  await expect(page.getByLabel("视频渲染状态")).toContainText("video-workspaces/视频 A/renders/export.mp4");

  await page.getByRole("button", { name: "工作区管理" }).click();
  await page.getByLabel("工作区名称").fill("重命名后的视频 A");
  await page.getByLabel("工作区管理").getByRole("button", { name: "重命名" }).click();
  // 中文注释：重命名只更新显示名称，预览期间的私有目录、时间轴和素材不得被移动或清空。
  await expect(page.getByRole("combobox", { name: "选择视频工作区" })).toContainText("重命名后的视频 A");
  await expect(page.getByText("A 的素材.mp4").first()).toBeVisible();

  await page.getByLabel("工作区名称").fill("视频 B");
  await page.getByRole("button", { name: "新建" }).click();
  await expect(page.getByRole("combobox", { name: "选择视频工作区" })).toContainText("视频 B");
  // 中文注释：新建 B 后必须立即使用空快照；这条断言防止编辑器复用 A 的 useState 初始值。
  await expect(page.getByText("从左侧导入视频素材")).toBeVisible();
  await expect(page.getByText("视频片段 1")).toHaveCount(0);
  await page.locator('input[type="file"]').first().setInputFiles({ buffer: Buffer.from("video B"), mimeType: "video/mp4", name: "B 的素材.mp4" });
  await expect(page.getByText("B 的素材.mp4").first()).toBeVisible();
  await expect(page.getByLabel("保存状态")).toContainText("已自动保存");
  await page.getByRole("button", { name: "导出视频" }).click();
  await page.getByRole("button", { name: "开始导出" }).click();
  await expect(page.getByLabel("视频渲染状态")).toContainText("video-workspaces/视频 B/renders/export.mp4");

  await page.getByRole("combobox", { name: "选择视频工作区" }).click();
  await page.getByRole("option", { name: "重命名后的视频 A" }).click();
  await expect(page.getByRole("combobox", { name: "选择视频工作区" })).toContainText("重命名后的视频 A");
  await expect(page.getByText("A 的素材.mp4").first()).toBeVisible();
  await expect(page.getByText("B 的素材.mp4")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "选择视频工作区" })).toContainText("重命名后的视频 A");
  await expect(page.getByText("A 的素材.mp4").first()).toBeVisible();
  expect(library.get("视频 A")?.media).toHaveLength(1);
  expect(library.get("视频 B")?.media).toHaveLength(1);
  expect(library.get("视频 A")?.project.videoClips).toHaveLength(1);
  expect(library.get("视频 B")?.project.videoClips).toHaveLength(1);
  expect(renderedWorkspaceIds).toEqual(["视频 A", "视频 B"]);
});
