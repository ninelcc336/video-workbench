import { describe, expect, it } from "vitest";
import {
  createDecorationSmokeProject,
  createInformationSmokeProject,
  createSmokeProject,
  createTransitionSmokeProject,
} from "./render-smoke";

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

  it("为信息叠加和装饰动画构造当前特效族范围项目", () => {
    const informationProject = createInformationSmokeProject("information-media");
    const decorationProject = createDecorationSmokeProject("decoration-media");

    expect(informationProject.effectClips[0]).toMatchObject({
      effectFamilyId: "emphasis-card",
      startingStyleId: "solid-card",
      placement: { type: "range" },
    });
    expect(decorationProject.effectClips[0]).toMatchObject({
      effectFamilyId: "hand-drawn-emphasis",
      startingStyleId: "underline",
      placement: { type: "range" },
    });
  });

  it("为三个方向转场样式构造绑定相邻片段的双画面项目", () => {
    for (const startingStyleId of ["push-pull", "directional-wipe", "split-wipe"] as const) {
      const project = createTransitionSmokeProject("before-media", "after-media", startingStyleId);

      expect(project.effectClips[0]).toMatchObject({
        effectFamilyId: "directional-transition",
        startingStyleId,
        params: { mode: startingStyleId },
        placement: {
          type: "boundary",
          beforeVideoClipId: "transition-before",
          afterVideoClipId: "transition-after",
        },
      });
    }
  });
});
