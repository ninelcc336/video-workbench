import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { resetRemotionBundle } from "./remotion-bundler";

vi.mock("@remotion/renderer", () => ({
  renderMedia: vi.fn(async () => undefined),
  selectComposition: vi.fn(async () => ({
    durationInFrames: 30,
    fps: 30,
    height: 1920,
    id: "Editor",
    width: 1080,
  })),
}));

import { renderMedia, selectComposition } from "@remotion/renderer";
import { renderProject } from "./render-adapter";

afterEach(() => {
  resetRemotionBundle();
  delete process.env.REMOTION_SERVE_URL;
  vi.clearAllMocks();
});

describe("Remotion 渲染适配器", () => {
  it("没有环境变量时自动 bundle，并将真实媒体路径传入选择组合和渲染", async () => {
    const project = createEmptyProject();
    project.videoClips.push({
      id: "video-1",
      mediaId: "media-1",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      audioEnabled: true,
    });
    const bundle = vi.fn(async () => "file:///bundles/editor");
    const mediaSources = { "media-1": "C:/workspace/media/media-1.mp4" };

    await renderProject(project, "renders/test.mp4", {
      cancelSignal: () => false,
      mediaSources,
      bundle,
    });

    expect(bundle).toHaveBeenCalledTimes(1);
    expect(selectComposition).toHaveBeenCalledWith(expect.objectContaining({
      serveUrl: "file:///bundles/editor",
      inputProps: { project, mediaSources },
    }));
    expect(renderMedia).toHaveBeenCalledWith(expect.objectContaining({
      serveUrl: "file:///bundles/editor",
      inputProps: { project, mediaSources },
    }));
  });
});
