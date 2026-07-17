import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

const roots: string[] = [];

afterEach(async () => {
  resetRemotionBundle();
  delete process.env.REMOTION_SERVE_URL;
  vi.clearAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
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
    const root = await mkdtemp(join(tmpdir(), "video-effect-render-adapter-"));
    roots.push(root);
    const sourcePath = join(root, "media-1.mp4");
    await writeFile(sourcePath, "video bytes");
    const mediaSources = { "media-1": pathToFileURL(sourcePath).href };

    await renderProject(project, "renders/test.mp4", {
      cancelSignal: () => false,
      mediaSources,
      bundle,
      timeoutInMilliseconds: 1234,
    });

    expect(bundle).toHaveBeenCalledTimes(1);
    expect(selectComposition).toHaveBeenCalledWith(expect.objectContaining({
      serveUrl: "file:///bundles/editor",
      timeoutInMilliseconds: 1234,
    }));
    expect(renderMedia).toHaveBeenCalledWith(expect.objectContaining({
      serveUrl: "file:///bundles/editor",
      timeoutInMilliseconds: 1234,
    }));
    const selectedCall = (selectComposition as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [{ inputProps: { project: unknown; mediaSources: Record<string, string> } }];
    const renderedCall = (renderMedia as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [{ inputProps: { project: unknown; mediaSources: Record<string, string> } }];
    const selectedInputProps = selectedCall[0].inputProps;
    const renderedInputProps = renderedCall[0].inputProps;
    expect(selectedInputProps.project).toEqual(project);
    expect(selectedInputProps.mediaSources["media-1"]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/media\//);
    expect(renderedInputProps).toEqual(selectedInputProps);
  });
});
