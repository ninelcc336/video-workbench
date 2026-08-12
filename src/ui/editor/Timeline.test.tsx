// @vitest-environment jsdom

import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject } from "../../domain/project/model";
import { createEffectFamilyInstance, getEffectFamily } from "../../domain/templates/effect-family";
import "../../domain/templates/registry";
import { TEMPLATE_DRAG_MIME } from "./drag-and-drop";
import { clampClipRange, clampTimelineHeight, getTimelineHeightBounds, Timeline, TIMELINE_LABEL_WIDTH, pixelsToFrames } from "./Timeline";

afterEach(cleanup);

function createTimelineProject(): EditProject {
  const project = createEmptyProject();
  const family = getEffectFamily("card-overlay", 1);
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
      effectFamilyId: "card-overlay",
      startingStyleId: "default",
      placement: { type: "range" },
      trackId: "effects-1",
      fromFrame: 30,
      durationInFrames: 45,
      params: createEffectFamilyInstance(family, "default", "16:9").params,
    },
  ];
  return project;
}

describe("基础时间轴", () => {
  it("把时间轴高度限制在视口的一半，并支持拖拽调整", () => {
    expect(getTimelineHeightBounds(1000)).toEqual({ min: 160, max: 500 });
    expect(clampTimelineHeight(999, 1000)).toBe(500);
    expect(clampTimelineHeight(1, 1000)).toBe(160);

    render(<Timeline project={createTimelineProject()} selectedClipId={null} />);

    const resizeHandle = screen.getByRole("slider", { name: "调整时间轴高度" });
    expect(resizeHandle.getAttribute("aria-valuenow")).toBe("238");
    fireEvent.pointerDown(resizeHandle, { clientY: 600, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    expect(Number(resizeHandle.getAttribute("aria-valuenow"))).toBeGreaterThan(238);
  });

  it("让标尺零点、播放头零帧和轨道内容起点对齐", () => {
    render(<Timeline currentFrame={0} project={createTimelineProject()} selectedClipId={null} />);

    const rulerGutter = document.querySelector(".timeline-ruler__gutter");
    const playhead = document.querySelector(".timeline-playhead");
    expect(rulerGutter).toBeTruthy();
    expect((playhead as HTMLElement).style.left).toBe(`${TIMELINE_LABEL_WIDTH}px`);
    expect(document.querySelector(".timeline")?.getAttribute("style")).toContain("width: 1185px");
  });

  it("将屏幕像素换算为整数帧，并显示主轨道和特效轨道", () => {
    expect(pixelsToFrames(150, 10)).toBe(15);

    render(<Timeline project={createTimelineProject()} selectedClipId={null} />);

    expect(screen.getByText("主视频轨道")).toBeTruthy();
    expect(screen.getByText("特效轨道 1")).toBeTruthy();
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
    expect(clip.getAttribute("aria-pressed")).toBe("true");
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

  it("拖动片段期间持续发出临时项目，松开后清理临时项目", () => {
    const onPreviewProject = vi.fn();

    render(
      <Timeline
        onPreviewProject={onPreviewProject}
        onMoveClip={vi.fn()}
        pixelsPerFrame={10}
        project={createTimelineProject()}
        selectedClipId={null}
      />,
    );

    const clip = screen.getByRole("button", { name: /弹入卡片/ });
    fireEvent.mouseDown(clip, { clientX: 300, button: 0 });
    fireEvent.mouseMove(window, { clientX: 350 });

    const preview = onPreviewProject.mock.calls.at(-1)?.[0] as EditProject;
    expect(preview.effectClips[0].fromFrame).toBe(35);

    fireEvent.mouseUp(window);
    expect(onPreviewProject).toHaveBeenLastCalledWith(null);
  });

  it("拖动标尺期间持续更新播放头且鼠标松开结束手势", () => {
    const onSeekFrame = vi.fn();
    render(
      <Timeline
        onSeekFrame={onSeekFrame}
        pixelsPerFrame={10}
        project={createTimelineProject()}
        selectedClipId={null}
      />,
    );

    const ruler = document.querySelector(".timeline-ruler__scale") as HTMLElement;
    ruler.getBoundingClientRect = () => ({
      bottom: 30,
      height: 27,
      left: 100,
      right: 1000,
      top: 0,
      width: 900,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(ruler, { button: 0, clientX: 150 });
    fireEvent.mouseMove(window, { clientX: 200 });
    fireEvent.mouseUp(window);

    expect(onSeekFrame).toHaveBeenNthCalledWith(1, 5);
    expect(onSeekFrame).toHaveBeenLastCalledWith(10);
  });

  it("没有实际移动时不发出片段提交事件", () => {
    const onMoveClip = vi.fn();
    render(
      <Timeline
        onMoveClip={onMoveClip}
        pixelsPerFrame={10}
        project={createTimelineProject()}
        selectedClipId={null}
      />,
    );

    const clip = screen.getByRole("button", { name: /弹入卡片/ });
    fireEvent.mouseDown(clip, { button: 0, clientX: 300 });
    fireEvent.mouseUp(window);

    expect(onMoveClip).not.toHaveBeenCalled();
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
    const template = getEffectFamily("bubble-decoration", 1);
    const values = new Map<string, string>([
      [TEMPLATE_DRAG_MIME, JSON.stringify({ effectFamilyId: template.id, effectFamilyVersion: template.version, startingStyleId: "default" })],
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

    const effectTrack = screen.getByRole("region", { name: "特效轨道 1放置区" });
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

    expect(onDropTemplate).toHaveBeenCalledWith(template, "default", 25);
  });

  it("非法位置拖入片段转场时只提示，不把它创建成普通范围特效", () => {
    const onDropTemplate = vi.fn();
    const onInvalidTemplateDrop = vi.fn();
    const template = getEffectFamily("basic-transition", 1);
    const values = new Map<string, string>([
      [TEMPLATE_DRAG_MIME, JSON.stringify({ effectFamilyId: template.id, effectFamilyVersion: template.version, startingStyleId: "default" })],
    ]);
    const dataTransfer = {
      dropEffect: "none",
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;

    render(
      <Timeline
        onDropTemplate={onDropTemplate}
        onInvalidTemplateDrop={onInvalidTemplateDrop}
        pixelsPerFrame={10}
        project={createTimelineProject()}
        selectedClipId={null}
      />,
    );

    const effectTrack = screen.getByRole("region", { name: "特效轨道 1放置区" });
    effectTrack.getBoundingClientRect = () => ({
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
    const dropEvent = createEvent.drop(effectTrack, { dataTransfer });
    Object.defineProperty(dropEvent, "clientX", { value: 350 });
    fireEvent(effectTrack, dropEvent);

    expect(onDropTemplate).not.toHaveBeenCalled();
    expect(onInvalidTemplateDrop).toHaveBeenCalledWith("片段转场只能放在相邻视频片段交界点。");
  });

  it("拖入片段转场到合法交界点时传递前后视频片段身份", () => {
    const onDropTransition = vi.fn();
    const template = getEffectFamily("basic-transition", 1);
    const project = createTimelineProject();
    project.videoClips.push({
      ...project.videoClips[0],
      id: "video-2",
      fromFrame: 90,
    });
    const values = new Map<string, string>([
      [TEMPLATE_DRAG_MIME, JSON.stringify({ effectFamilyId: template.id, effectFamilyVersion: template.version, startingStyleId: "default" })],
    ]);
    const dataTransfer = {
      dropEffect: "none",
      getData: (type: string) => values.get(type) ?? "",
    } as unknown as DataTransfer;

    render(
      <Timeline
        onDropTransition={onDropTransition}
        pixelsPerFrame={10}
        project={project}
        selectedClipId={null}
      />,
    );

    const effectTrack = screen.getByRole("region", { name: "特效轨道 1放置区" });
    effectTrack.getBoundingClientRect = () => ({
      bottom: 100,
      height: 56,
      left: 100,
      right: 2000,
      top: 0,
      width: 1900,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });
    const dropEvent = createEvent.drop(effectTrack, { dataTransfer });
    Object.defineProperty(dropEvent, "clientX", { value: 1000 });
    fireEvent(effectTrack, dropEvent);

    expect(onDropTransition).toHaveBeenCalledWith(template, "default", {
      beforeVideoClipId: "video-1",
      afterVideoClipId: "video-2",
      frame: 90,
    });
  });

  it("重叠特效显示在可分别操作的多条轨道", () => {
    const project = createTimelineProject();
    project.effectClips.push({
      ...project.effectClips[0],
      id: "effect-2",
      fromFrame: 50,
      durationInFrames: 40,
    });

    render(<Timeline project={project} selectedClipId={null} />);

    expect(screen.getByText("特效轨道 1")).toBeTruthy();
    expect(screen.getByText("特效轨道 2")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /特效片段/ })).toHaveLength(2);
  });
});
// 中文注释：验证时间轴显示和片段操作事件。
