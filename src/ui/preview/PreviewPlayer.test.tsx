// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject } from "../../domain/project/model";
import { clampPreviewFrame, PreviewPlayer } from "./PreviewPlayer";

const mockPlayer = vi.hoisted(() => ({
  addEventListener: vi.fn(),
  getCurrentFrame: vi.fn(() => 12),
  lastInputProps: undefined as unknown,
  removeEventListener: vi.fn(),
  seekTo: vi.fn(),
}));

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  return {
    Player: React.forwardRef((props: { controls?: boolean; initialFrame?: number; inputProps?: unknown }, ref) => {
      mockPlayer.lastInputProps = props.inputProps;
      React.useImperativeHandle(ref, () => mockPlayer);
      return React.createElement("div", {
        "data-controls": String(Boolean(props.controls)),
        "data-initial-frame": String(props.initialFrame),
        "data-testid": "mock-player",
      });
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createProject() {
  const project = createEmptyProject();
  project.videoClips = [{
    id: "video-1",
    mediaId: "media-1",
    fromFrame: 0,
    sourceStartFrame: 0,
    durationInFrames: 60,
    audioEnabled: true,
  }];
  return project;
}

describe("实时预览播放同步", () => {
  it("关闭 Player 默认控制栏，并以当前帧初始化 Player", () => {
    render(<PreviewPlayer currentFrame={12} mediaSources={{ "media-1": "file:///media-1.mp4" }} project={createProject()} />);

    expect(screen.getByTestId("mock-player").getAttribute("data-controls")).toBe("false");
    expect(screen.getByTestId("mock-player").getAttribute("data-initial-frame")).toBe("12");
  });

  it("Player 帧事件会同步到页面，外部定位会调用 seekTo", () => {
    const onFrameChange = vi.fn();
    const { rerender } = render(
      <PreviewPlayer
        currentFrame={12}
        mediaSources={{ "media-1": "file:///media-1.mp4" }}
        onFrameChange={onFrameChange}
        project={createProject()}
      />,
    );

    const frameListener = mockPlayer.addEventListener.mock.calls.find(([eventName]) => eventName === "frameupdate")?.[1];
    expect(typeof frameListener).toBe("function");
    frameListener({ detail: { frame: 24 } });
    expect(onFrameChange).toHaveBeenCalledWith(24);

    rerender(
      <PreviewPlayer
        currentFrame={36}
        mediaSources={{ "media-1": "file:///media-1.mp4" }}
        onFrameChange={onFrameChange}
        project={createProject()}
      />,
    );
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(36);
  });

  it("播放头不会被推进到项目时长之外", () => {
    expect(clampPreviewFrame(-2, 60)).toBe(0);
    expect(clampPreviewFrame(60, 60)).toBe(59);
  });

  it("播放头变化复用输入快照，参数快照变化则传入新值", () => {
    const project = createProject();
    const mediaSources = { "media-1": "file:///media-1.mp4" };
    const { rerender } = render(
      <PreviewPlayer currentFrame={12} mediaSources={mediaSources} project={project} />,
    );
    const firstInputProps = mockPlayer.lastInputProps;

    rerender(
      <PreviewPlayer currentFrame={18} mediaSources={mediaSources} project={project} />,
    );
    expect(mockPlayer.lastInputProps).toBe(firstInputProps);

    const changedProject: EditProject = {
      ...project,
      effectClips: [{
        id: "effect-1",
        templateId: "card-overlay",
        templateVersion: 1,
        effectFamilyId: "card-overlay",
        startingStyleId: "default",
        placement: { type: "range" },
        trackId: "effects-1",
        fromFrame: 0,
        durationInFrames: 60,
        params: { text: "新文字" },
      }],
    };
    rerender(
      <PreviewPlayer currentFrame={18} mediaSources={mediaSources} project={changedProject} />,
    );
    expect(mockPlayer.lastInputProps).not.toBe(firstInputProps);
    expect((mockPlayer.lastInputProps as { project: typeof changedProject }).project).toBe(changedProject);
  });
});
