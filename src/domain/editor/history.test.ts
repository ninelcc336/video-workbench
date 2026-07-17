import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../project/factories";
import type { EditProject } from "../project/model";
import { createHistory } from "./history";

function projectWithVideo(): EditProject {
  const project = createEmptyProject();
  project.videoClips.push({
    id: "video-1",
    mediaId: "media-1",
    fromFrame: 0,
    sourceStartFrame: 0,
    durationInFrames: 30,
    audioEnabled: true,
  });
  return project;
}

describe("编辑历史公共接口", () => {
  it("可以记录快照并按顺序撤销和重做", () => {
    const initial = createEmptyProject();
    const history = createHistory(initial);
    const next = projectWithVideo();

    history.push(next);

    expect(history.getSnapshot()).toEqual(next);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    history.undo();
    expect(history.getSnapshot()).toEqual(initial);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(history.getSnapshot()).toEqual(next);
  });

  it("不会被外部对初始项目或已记录项目的修改污染", () => {
    const initial = createEmptyProject();
    const history = createHistory(initial);
    const next = projectWithVideo();

    history.push(next);
    next.videoClips[0].fromFrame = 99;
    initial.videoClips.push({
      id: "outside",
      mediaId: "media-outside",
      fromFrame: 30,
      sourceStartFrame: 0,
      durationInFrames: 10,
      audioEnabled: false,
    });

    expect(history.getSnapshot().videoClips[0].fromFrame).toBe(0);
    history.undo();
    expect(history.getSnapshot().videoClips).toEqual([]);
  });

  it("记录新快照后会清空重做栈", () => {
    const history = createHistory(createEmptyProject());
    history.push(projectWithVideo());
    history.undo();

    history.push(createEmptyProject({ width: 1920, height: 1080 }));

    expect(history.canRedo()).toBe(false);
    expect(history.getSnapshot().settings.width).toBe(1920);
  });
});
