import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../project/factories";
import { findNearestLegalVideoStart, normalizeVideoRange } from "./clip-ranges";

function createProject() {
  const project = createEmptyProject();
  project.videoClips = [
    {
      audioEnabled: true,
      durationInFrames: 30,
      fromFrame: 0,
      id: "video-1",
      mediaId: "media-1",
      sourceStartFrame: 0,
    },
    {
      audioEnabled: true,
      durationInFrames: 30,
      fromFrame: 60,
      id: "video-2",
      mediaId: "media-2",
      sourceStartFrame: 0,
    },
  ];
  return project;
}

describe("时间轴片段范围", () => {
  it("把冲突的视频移动到最近的合法边界", () => {
    expect(findNearestLegalVideoStart(createProject(), "video-1", 40, 30)).toBe(30);
    expect(findNearestLegalVideoStart(createProject(), "video-1", 32, 20)).toBe(32);
  });

  it("限制视频右裁剪不能进入下一个视频片段", () => {
    expect(normalizeVideoRange(createProject(), "video-1", 0, 80, "resize-right")).toEqual({
      fromFrame: 0,
      durationInFrames: 60,
    });
  });

  it("限制视频左裁剪不能越过上一个视频片段的结束位置", () => {
    expect(normalizeVideoRange(createProject(), "video-2", 10, 80, "resize-left")).toEqual({
      fromFrame: 30,
      durationInFrames: 60,
    });
  });
});
