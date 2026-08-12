import { describe, expect, it } from "vitest";
import { createEmptyProject } from "./factories";
import type { EditProject, EffectClip, VideoClip } from "./model";
import {
  getTransitionVideoFrames,
  reconcileBoundaryTransitionPlacements,
  resolveBoundaryTransition,
} from "./transition";

function createVideoClip(overrides: Partial<VideoClip>): VideoClip {
  return {
    id: "video-1",
    mediaId: "media-1",
    fromFrame: 0,
    sourceStartFrame: 0,
    durationInFrames: 30,
    audioEnabled: true,
    ...overrides,
  };
}

function createBoundaryEffect(overrides: Partial<EffectClip> = {}): EffectClip {
  return {
    id: "transition-1",
    templateId: "directional-transition",
    templateVersion: 1,
    effectFamilyId: "basic-transition",
    startingStyleId: "default",
    trackId: "effects-1",
    fromFrame: 999,
    durationInFrames: 8,
    params: {},
    placement: {
      type: "boundary",
      beforeVideoClipId: "video-1",
      afterVideoClipId: "video-2",
    },
    ...overrides,
  };
}

function createBoundaryProject(): EditProject {
  return {
    ...createEmptyProject({ width: 1920, height: 1080 }),
    videoClips: [
      createVideoClip({
        id: "video-1",
        durationInFrames: 30,
        sourceDurationInFrames: 36,
      }),
      createVideoClip({
        id: "video-2",
        mediaId: "media-2",
        fromFrame: 30,
        sourceStartFrame: 10,
        durationInFrames: 45,
        sourceDurationInFrames: 100,
      }),
    ],
    effectClips: [createBoundaryEffect()],
  };
}

describe("真实片段转场模型", () => {
  it("从当前相邻视频片段交界点派生起始帧，而不是使用旧坐标", () => {
    const project = createBoundaryProject();
    project.videoClips[0].fromFrame = 18;
    project.videoClips[1].fromFrame = 48;

    const resolved = resolveBoundaryTransition(project, project.effectClips[0]);

    expect(resolved).toMatchObject({
      fromFrame: 48,
      durationInFrames: 8,
      beforeVideoClip: { id: "video-1" },
      afterVideoClip: { id: "video-2", fromFrame: 48 },
    });
  });

  it("在前视频源素材有尾帧时继续使用尾帧，尾帧不足时冻结最后有效画面", () => {
    const project = createBoundaryProject();
    const resolved = resolveBoundaryTransition(project, project.effectClips[0]);
    if (!resolved) throw new Error("测试转场应当可以解析");

    expect(getTransitionVideoFrames(resolved, 4)).toEqual({
      beforeSourceFrame: 34,
      afterSourceFrame: 14,
      beforeFrozen: false,
      afterFrozen: false,
    });

    const shortSourceProject = createBoundaryProject();
    shortSourceProject.videoClips[0].sourceDurationInFrames = 32;
    const shortResolved = resolveBoundaryTransition(
      shortSourceProject,
      shortSourceProject.effectClips[0],
    );
    if (!shortResolved) throw new Error("短源素材转场应当可以解析");

    expect(getTransitionVideoFrames(shortResolved, 7)).toEqual({
      beforeSourceFrame: 31,
      afterSourceFrame: 17,
      beforeFrozen: true,
      afterFrozen: false,
    });
    expect(shortResolved.warnings).toContain("前视频素材尾帧不足，转场期间将冻结最后一个有效画面");

    const edgeTailProject = createBoundaryProject();
    edgeTailProject.videoClips[0].sourceDurationInFrames = 37;
    const edgeTailResolved = resolveBoundaryTransition(
      edgeTailProject,
      edgeTailProject.effectClips[0],
    );
    if (!edgeTailResolved) throw new Error("边界尾帧转场应当可以解析");

    expect(getTransitionVideoFrames(edgeTailResolved, 7).beforeFrozen).toBe(true);
    expect(edgeTailResolved.warnings).toContain("前视频素材尾帧不足，转场期间将冻结最后一个有效画面");
  });

  it("绑定的视频片段不再相邻时移除转场，仍相邻时更新派生位置", () => {
    const project = createBoundaryProject();
    project.videoClips[1].fromFrame = 32;

    const reconciled = reconcileBoundaryTransitionPlacements(project);

    expect(reconciled.project.effectClips).toHaveLength(0);
    expect(reconciled.removedEffectClipIds).toEqual(["transition-1"]);

    const movedBack = createBoundaryProject();
    movedBack.videoClips[1].fromFrame = 30;
    const stillValid = reconcileBoundaryTransitionPlacements(movedBack);
    expect(stillValid.project.effectClips[0].fromFrame).toBe(30);
    expect(stillValid.removedEffectClipIds).toEqual([]);
  });
});
