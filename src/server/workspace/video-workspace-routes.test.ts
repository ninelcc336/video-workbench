import express from "express";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { VideoWorkspaceAdapter } from "./video-workspace-adapter";
import { createVideoWorkspaceRouter } from "./video-workspace-routes";

const servers: Server[] = [];
const temporaryRoots: string[] = [];

/** 中文注释：HTTP 测试使用真实临时目录，确保断言覆盖路由到私有媒体目录的完整调用链。 */
async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "video-workspace-routes-"));
  temporaryRoots.push(root);
  return root;
}

/** 中文注释：启动仅挂载工作区路由的测试服务器，避免依赖开发机上的实际应用数据。 */
async function createTestServer(adapter: VideoWorkspaceAdapter): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use("/api", createVideoWorkspaceRouter(adapter));
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务未成功监听");
  return `http://127.0.0.1:${address.port}`;
}

/** 中文注释：用浏览器同样的 multipart 请求导入最小视频字节，路由只需要 MIME 类型与私有写入边界。 */
async function importMedia(baseUrl: string, workspaceId: string, fileName: string): Promise<{ id: string; originalName: string }> {
  const form = new FormData();
  form.append("file", new Blob([`private media: ${workspaceId}`], { type: "video/mp4" }), fileName);
  form.append("durationInSeconds", "1");
  form.append("width", "1920");
  form.append("height", "1080");
  form.append("fps", "30");
  const response = await fetch(`${baseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/media`, { body: form, method: "POST" });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: string; originalName: string }>;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("视频工作区 HTTP 路由", () => {
  it("素材列表、读取与删除都严格限定在请求的工作区", async () => {
    const adapter = new VideoWorkspaceAdapter(await createTemporaryRoot());
    await adapter.initialize();
    await adapter.createWorkspace("视频 A", createEmptyProject());
    await adapter.createWorkspace("视频 B", createEmptyProject());
    const baseUrl = await createTestServer(adapter);

    const mediaA = await importMedia(baseUrl, "视频 A", "a.mp4");
    const mediaB = await importMedia(baseUrl, "视频 B", "b.mp4");
    const listedA = await fetch(`${baseUrl}/api/workspaces/${encodeURIComponent("视频 A")}/media`);
    const listedB = await fetch(`${baseUrl}/api/workspaces/${encodeURIComponent("视频 B")}/media`);

    await expect(listedA.json()).resolves.toEqual([expect.objectContaining({ id: mediaA.id, originalName: "a.mp4" })]);
    await expect(listedB.json()).resolves.toEqual([expect.objectContaining({ id: mediaB.id, originalName: "b.mp4" })]);
    expect((await fetch(`${baseUrl}/api/workspaces/${encodeURIComponent("视频 A")}/media/${encodeURIComponent(mediaB.id)}`)).status).toBe(404);

    expect((await fetch(`${baseUrl}/api/workspaces/${encodeURIComponent("视频 B")}/media/${encodeURIComponent(mediaB.id)}`, { method: "DELETE" })).status).toBe(204);
    await expect(adapter.getMediaAsset("视频 A", mediaA.id)).resolves.toMatchObject({ id: mediaA.id });
    await expect(adapter.getMediaAsset("视频 B", mediaB.id)).resolves.toBeNull();
  });

  it("快照损坏时只向当前工作区提供最近备份恢复入口", async () => {
    const adapter = new VideoWorkspaceAdapter(await createTemporaryRoot());
    await adapter.initialize();
    const original = createEmptyProject();
    const updated = createEmptyProject();
    updated.settings.fps = 24;
    await adapter.createWorkspace("视频 A", original);
    await adapter.saveWorkspace("视频 A", updated);
    await writeFile(join(adapter.getWorkspacePaths("视频 A").root, "workspace.json"), "{损坏快照", "utf8");
    const baseUrl = await createTestServer(adapter);

    const readFailure = await fetch(`${baseUrl}/api/workspaces/${encodeURIComponent("视频 A")}`);
    expect(readFailure.status).toBe(409);
    await expect(readFailure.json()).resolves.toMatchObject({ backupAvailable: true, code: "corrupt_project" });

    const recovered = await fetch(`${baseUrl}/api/workspaces/${encodeURIComponent("视频 A")}/recover`, { method: "POST" });
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({ workspace: original });
  });

  it("重命名只改变显示名称，不移动工作区私有目录 ID", async () => {
    const adapter = new VideoWorkspaceAdapter(await createTemporaryRoot());
    await adapter.initialize();
    await adapter.createWorkspace("内部目录 A", createEmptyProject());
    const baseUrl = await createTestServer(adapter);

    const response = await fetch(`${baseUrl}/api/workspaces/${encodeURIComponent("内部目录 A")}`, {
      body: JSON.stringify({ name: "展示名称 A" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "内部目录 A", name: "展示名称 A" });
    await expect(adapter.listWorkspaces()).resolves.toEqual([expect.objectContaining({ id: "内部目录 A", name: "展示名称 A" })]);
    await expect(adapter.loadWorkspace("内部目录 A")).resolves.toMatchObject({ workspace: createEmptyProject() });
  });
});
