// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject } from "../../domain/project/model";
import { getTemplateDefaultParams, getTemplate } from "../../domain/templates/registry";
import { TEMPLATE_DRAG_MIME } from "./drag-and-drop";
import { Timeline, clampClipRange, pixelsToFrames } from "./Timeline";

afterEach(cleanup);

function createTimelineProject(): EditProject {
  const project = createEmptyProject();
  project.videoClips = [
    {
      id: "video-1",
      mediaId: "media-1",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 90,
      audioEnabled: true,
    },
  ];
  project.effectClips = [
    {
      id: "effect-1",
      templateId: "card-overlay",
      templateVersion: 1,
      trackId: "effects-1",
      fromFrame: 30,
      durationInFrames: 45,
      params: getTemplateDefaultParams(getTemplate("card-overlay", 1)),
    },
  ];
  return project;
}

describe("基础时间轴", () => {
  it("将屏幕像素换算为整数帧，并显示主轨道和特效轨道", () => {
    expect(pixelsToFrames(150, 10)).toBe(15);

    render(<Timeline project={createTimelineProject()} selectedClipId={null} />);

    expect(screen.getByText("主视频轨道")).toBeTruthy();
    expect(screen.getByText("特效轨道")).toBeTruthy();
    expect(screen.getByText("弹入卡片")).toBeTruthy();
  });

  it("点击片段会发出选择事件并高亮当前片段", () => {
    const onSelectClip = vi.fn();

    render(
      <Timeline
        project={createTimelineProject()}
        selectedClipId="effect-1"
        onSelectClip={onSelectClip}
      />,
    );

    const clip = screen.getByRole("button", { name: /弹入卡片/ });
    fireEvent.click(clip);

    expect(onSelectClip).toHaveBeenCalledWith("effect-1");
    expect(clip.className).toContain("selected");
  });

  it("拖动片段会发出移动命令，裁剪结果不会产生负时长", () => {
    const onMoveClip = vi.fn();
    const onResizeClip = vi.fn();

    render(
      <Timeline
        project={createTimelineProject()}
        selectedClipId={null}
        pixelsPerFrame={10}
        onMoveClip={onMoveClip}
        onResizeClip={onResizeClip}
      />,
    );

    const clip = screen.getByRole("button", { name: /弹入卡片/ });
    fireEvent.mouseDown(clip, { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 350 });
    fireEvent.mouseUp(window);

    expect(onMoveClip).toHaveBeenCalledWith("effect-1", "effect", 35);

    expect(clampClipRange(-20, 5, 0, 90)).toEqual({ fromFrame: 0, durationInFrames: 5 });

    const resizeHandle = screen.getByLabelText("调整弹入卡片结束位置");
    fireEvent.mouseDown(resizeHandle, { clientX: 750 });
    fireEvent.mouseMove(window, { clientX: 600 });
    fireEvent.mouseUp(window);

    expect(onResizeClip).toHaveBeenCalledWith("effect-1", "effect", 30, 30);
  });

  it("删除键会发出删除事件", () => {
    const onDeleteClip = vi.fn();

    render(
      <Timeline
        project={createTimelineProject()}
        selectedClipId="effect-1"
        onDeleteClip={onDeleteClip}
      />,
    );

    fireEvent.keyDown(window, { key: "Delete" });

    expect(onDeleteClip).toHaveBeenCalledWith("effect-1", "effect");
  });

  it("接收模板拖放并把时间轴位置换算成特效起始帧", () => {
    const onDropTemplate = vi.fn();
    const template = getTemplate("bubble-decoration", 1);
    const values = new Map<string, string>([
      [TEMPLATE_DRAG_MIME, JSON.stringify({ templateId: template.id, templateVersion: template.version })],
    ]);
    const dataTransfer = {
      dropEffect: "none",
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;

    render(
      <Timeline
        onDropTemplate={onDropTemplate}
        pixelsPerFrame={10}
        project={createTimelineProject()}
        selectedClipId={null}
      />,
    );

    const effectTrack = screen.getByText("特效轨道").parentElement?.querySelector(".timeline-track__content") as HTMLElement;
    expect(effectTrack).toBeTruthy();
    (effectTrack as HTMLElement).getBoundingClientRect = () => ({
      bottom: 100,
      height: 56,
      left: 100,
      right: 1100,
      top: 0,
      width: 1000,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    const dropEvent = createEvent.drop(effectTrack as HTMLElement, { dataTransfer });
    Object.defineProperty(dropEvent, "clientX", { value: 350 });
    fireEvent(effectTrack, dropEvent);

    expect(onDropTemplate).toHaveBeenCalledWith(template, 25);
  });
});
// 中文注释：验证时间轴显示和片段操作事件。
