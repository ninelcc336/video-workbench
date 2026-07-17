import express from "express";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceAdapter, type WorkspaceAdapter } from "./workspace-adapter";
import { createWorkspaceRouter } from "./workspace-routes";
import { createEmptyProject } from "../../domain/project/factories";

const temporaryRoots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function startWorkspaceServer(): Promise<{ adapter: WorkspaceAdapter; baseUrl: string }> {
  const root = await mkdtemp(join(tmpdir(), "video-effect-route-"));
  temporaryRoots.push(root);
  const adapter = createWorkspaceAdapter(root);
  await adapter.createWorkspace();
  const app = express();
  app.use(createWorkspaceRouter(adapter));
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务未成功监听");
  return { adapter, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe("工作区 HTTP 素材接口", () => {
  it("把浏览器 multipart 文件复制到 media，并可通过稳定地址读取", async () => {
    const { adapter, baseUrl } = await startWorkspaceServer();
    const form = new FormData();
    form.append("file", new Blob(["真实视频字节"], { type: "video/mp4" }), "旅行片段.mp4");

    const response = await fetch(`${baseUrl}/media`, { method: "POST", body: form });
    expect(response.status).toBe(201);
    const asset = await response.json() as { id: string; relativePath: string };
    expect(asset.relativePath).toMatch(new RegExp(`^media/${asset.id}\\.mp4$`));

    await expect(readFile(join(adapter.getPaths().root, asset.relativePath), "utf8")).resolves.toBe("真实视频字节");
    const mediaResponse = await fetch(`${baseUrl}/media/${asset.id}`);
    expect(mediaResponse.status).toBe(200);
    await expect(mediaResponse.text()).resolves.toBe("真实视频字节");
  });

  it("重新打开缺失素材的项目时返回项目和缺失状态，而不是让页面崩溃", async () => {
    const { adapter, baseUrl } = await startWorkspaceServer();
    const project = createEmptyProject();
    project.videoClips.push({
      id: "video-1",
      mediaId: "missing-media",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled: true,
    });
    await adapter.saveProject(project, "recoverable-project");

    const response = await fetch(`${baseUrl}/projects/recoverable-project`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project,
      missingMediaIds: ["missing-media"],
    });
  });
});
