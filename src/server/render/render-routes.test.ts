import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { RenderAdapter } from "./render-adapter";
import { createRenderRouter } from "./render-routes";
import type { WorkspacePaths } from "../workspace/workspace-paths";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("渲染路由素材编排", () => {
  it("从本地工作区解析真实 mediaSources，并传给渲染任务", async () => {
    const project = createEmptyProject();
    project.videoClips.push({
      id: "video-1",
      mediaId: "media-1",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled: true,
    });
    const renderProject: RenderAdapter = vi.fn(async (_project, outputPath, options) => {
      expect(options.mediaSources).toEqual({ "media-1": "C:/workspace/media/media-1.mp4" });
      return { outputPath, contentType: "video/mp4" as const };
    });
    const workspace = {
      getMediaSources: vi.fn(async () => ({ "media-1": "C:/workspace/media/media-1.mp4" })),
    };
    const app = express();
    app.use(express.json());
    app.use(createRenderRouter({ workspace, renderProject }));
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务未成功监听");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, outputPath: "renders/test.mp4" }),
    });
    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(workspace.getMediaSources).toHaveBeenCalledWith(["media-1"]));
    expect(renderProject).toHaveBeenCalled();
  });

  it("携带工作区标识时只解析该工作区素材，并把导出文件写入该工作区目录", async () => {
    const project = createEmptyProject();
    project.videoClips.push({
      id: "video-a",
      mediaId: "media-a",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled: true,
    });
    const renderProject: RenderAdapter = vi.fn(async (_project, outputPath, options) => {
      expect(options.mediaSources).toEqual({ "media-a": "file:///C:/workspace/video-a/media/media-a.mp4" });
      expect(outputPath).toContain("video-a");
      expect(outputPath).toContain("renders");
      return { outputPath, contentType: "video/mp4" as const };
    });
    const paths = { renders: "C:/workspace/video-a/renders" } as WorkspacePaths;
    const workspace = {
      getMediaSources: vi.fn(async () => ({ "media-a": "file:///C:/workspace/video-a/media/media-a.mp4" })),
      getWorkspacePaths: vi.fn(() => paths),
    };
    const app = express();
    app.use(express.json());
    app.use(createRenderRouter({ workspace, renderProject }));
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("测试服务未成功监听");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, outputPath: "../../other-workspace.mp4", workspaceId: "视频 A" }),
    });
    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(workspace.getMediaSources).toHaveBeenCalledWith("视频 A", ["media-a"]));
    await vi.waitFor(() => expect(renderProject).toHaveBeenCalled());
  });
});
