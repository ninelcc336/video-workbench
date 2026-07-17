import { describe, expect, it } from "vitest";
import { createSmokeProject } from "./render-smoke";

describe("真实 MP4 冒烟项目", () => {
  it("使用稳定 mediaId 构造单视频片段项目", () => {
    const project = createSmokeProject("smoke-media");

    expect(project.videoClips).toEqual([
      expect.objectContaining({
        mediaId: "smoke-media",
        fromFrame: 0,
        durationInFrames: 30,
        audioEnabled: true,
      }),
    ]);
    expect(project.settings).toEqual({ width: 64, height: 64, fps: 30 });
  });
});
