import { afterEach, describe, expect, it, vi } from "vitest";
import { renderStill, selectComposition } from "@remotion/renderer";
import { renderEffectFrame } from "./effect-visual-renderer";

vi.mock("@remotion/renderer", () => ({
  renderStill: vi.fn(async () => ({ buffer: null, contentType: "image/png" })),
  selectComposition: vi.fn(async () => ({
    durationInFrames: 30,
    fps: 30,
    height: 1080,
    id: "EffectFrame",
    width: 1920,
  })),
}));

// 中文注释：渲染器测试只观察 selectComposition/renderStill 的公共调用契约，不启动真实 Chromium。
afterEach(() => {
  delete process.env.REMOTION_SERVE_URL;
  vi.clearAllMocks();
});

describe("特效固定帧 Remotion 渲染器", () => {
  it("用 EffectFrame 组合渲染规范化输入并固定画幅、帧和随机种子", async () => {
    const renderProps = {
      frame: 11,
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 30,
      params: { text: "固定帧" },
      effectFamilyId: "card-overlay",
      effectFamilyVersion: 1,
      startingStyleId: "default",
      aspectRatio: "9:16" as const,
      randomSeed: "visual-test-seed",
    };
    const bundle = vi.fn(async () => "file:///bundles/effect-visual");

    await renderEffectFrame(renderProps, "test-results/effect-frame.png", { bundle });

    expect(bundle).toHaveBeenCalledTimes(1);
    expect(selectComposition).toHaveBeenCalledWith(expect.objectContaining({
      id: "EffectFrame",
      serveUrl: "file:///bundles/effect-visual",
      inputProps: { renderProps },
    }));
    expect(renderStill).toHaveBeenCalledWith(expect.objectContaining({
      frame: 11,
      inputProps: { renderProps },
      output: "test-results/effect-frame.png",
      serveUrl: "file:///bundles/effect-visual",
      composition: expect.objectContaining({ width: 1080, height: 1920, fps: 30, durationInFrames: 30 }),
    }));
  });
});
