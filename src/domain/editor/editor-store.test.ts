import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../project/factories";
import type { EditProject, EffectClip, VideoClip } from "../project/model";
import {
  createEffectFamilyInstance,
  getEffectFamily,
  registerEffectFamily,
} from "../templates/effect-family";
import type { EffectFamilyDefinition } from "../templates/types";
import { createEditorStore } from "./editor-store";
import "../templates/registry";

const videoClip: VideoClip = {
  id: "video-1",
  mediaId: "media-1",
  fromFrame: 0,
  sourceStartFrame: 0,
  durationInFrames: 30,
  audioEnabled: true,
};

const effectClip: EffectClip = {
  id: "effect-1",
  templateId: "card-overlay",
  templateVersion: 1,
  effectFamilyId: "card-overlay",
  startingStyleId: "default",
  placement: { type: "range" },
  trackId: "effects-1",
  fromFrame: 10,
  durationInFrames: 20,
  params: { text: "原文" },
};

const styleSwitchFamily: EffectFamilyDefinition = {
  id: "editor-command-style-fixture",
  version: 1,
  category: "information-overlay",
  name: "编辑命令样式测试族",
  description: "验证样式切换命令的公共行为。",
  purposeTags: ["测试"],
  visualDirections: ["简洁信息"],
  defaultDurationInFrames: 30,
  parameters: [
    {
      key: "text",
      label: "文字",
      type: "text",
      defaultValue: "默认文字",
      group: "content",
      level: "basic",
      styleSwitch: "preserve",
    },
    {
      key: "position",
      label: "位置",
      type: "position",
      defaultValue: { x: 0.5, y: 0.5 },
      group: "layout",
      level: "basic",
      styleSwitch: "preserve",
    },
    {
      key: "color",
      label: "颜色",
      type: "color",
      defaultValue: "#111827",
      group: "appearance",
      level: "basic",
      styleSwitch: "replace",
    },
    {
      key: "animation",
      label: "动画",
      type: "select",
      defaultValue: "fade",
      options: [{ value: "fade", label: "淡入" }, { value: "slide", label: "滑入" }],
      group: "animation",
      level: "advanced",
      styleSwitch: "replace",
    },
  ],
  startingStyles: [
    { id: "clean", name: "简洁", visualDirection: "简洁信息", defaultParams: { color: "#111827", animation: "fade" } },
    { id: "tech", name: "科技", visualDirection: "科技数据", defaultParams: { color: "#38bdf8", animation: "slide" } },
  ],
  aspectRatioDefaults: {},
  render: (props) => createElement("div", { "data-family": props.effectFamilyId }),
};

registerEffectFamily(styleSwitchFamily);

function createStore() {
  return createEditorStore(createEmptyProject());
}

describe("命令式编辑器核心", () => {
  it("绑定相邻视频片段创建真实转场，并可整体撤销和重做", () => {
    const store = createStore();
    store.dispatch({ type: "add-video-clip", clip: videoClip });
    store.dispatch({
      type: "add-video-clip",
      clip: { ...videoClip, id: "video-2", mediaId: "media-2", fromFrame: 30 },
    });
    const transition: EffectClip = {
      ...effectClip,
      id: "boundary-transition",
      templateId: "directional-transition",
      effectFamilyId: "directional-transition",
      startingStyleId: "push-pull",
      params: createEffectFamilyInstance(getEffectFamily("directional-transition", 1), "push-pull", "16:9").params,
      placement: {
        type: "boundary",
        beforeVideoClipId: "video-1",
        afterVideoClipId: "video-2",
      },
    };

    store.dispatch({ type: "add-effect-clip", clip: transition });
    expect(store.getSnapshot().effectClips[0]).toMatchObject({ fromFrame: 30, placement: transition.placement });

    store.undo();
    expect(store.getSnapshot().effectClips).toEqual([]);

    store.redo();
    expect(store.getSnapshot().effectClips[0]).toMatchObject({
      fromFrame: 30,
      placement: transition.placement,
    });
  });

  it("绑定失效时在同一命令中移除转场并通知用户，删除操作可一次撤销恢复", () => {
    const store = createStore();
    const notices: string[][] = [];
    store.subscribe((_snapshot, currentNotices = []) => notices.push([...currentNotices]));
    store.dispatch({ type: "add-video-clip", clip: videoClip });
    store.dispatch({
      type: "add-video-clip",
      clip: { ...videoClip, id: "video-2", mediaId: "media-2", fromFrame: 30 },
    });
    store.dispatch({
      type: "add-effect-clip",
      clip: {
        ...effectClip,
        id: "boundary-transition",
        placement: {
          type: "boundary",
          beforeVideoClipId: "video-1",
          afterVideoClipId: "video-2",
        },
      },
    });

    store.dispatch({ type: "delete-video-clip", clipId: "video-1" });

    expect(store.getSnapshot().effectClips).toEqual([]);
    expect(notices.at(-1)?.[0]).toContain("已移除");
    store.undo();
    expect(store.getSnapshot().effectClips).toHaveLength(1);
  });

  it("后视频片段向后移动产生间隔时移除转场并保留可撤销通知", () => {
    const store = createStore();
    const notices: string[][] = [];
    store.subscribe((_snapshot, currentNotices = []) => notices.push([...currentNotices]));
    store.dispatch({ type: "add-video-clip", clip: videoClip });
    store.dispatch({
      type: "add-video-clip",
      clip: { ...videoClip, id: "video-2", mediaId: "media-2", fromFrame: 30 },
    });
    store.dispatch({
      type: "add-effect-clip",
      clip: {
        ...effectClip,
        id: "boundary-transition",
        templateId: "directional-transition",
        effectFamilyId: "directional-transition",
        startingStyleId: "push-pull",
        placement: {
          type: "boundary",
          beforeVideoClipId: "video-1",
          afterVideoClipId: "video-2",
        },
      },
    });

    store.dispatch({ type: "move-video-clip", clipId: "video-2", fromFrame: 36 });

    expect(store.getSnapshot().effectClips).toEqual([]);
    expect(notices.at(-1)?.[0]).toContain("不再相邻而已移除");
    store.undo();
    expect(store.getSnapshot().effectClips).toHaveLength(1);
    expect(store.getSnapshot().videoClips.find((clip) => clip.id === "video-2")?.fromFrame).toBe(30);
  });

  it("拒绝把非法交界点转场作为普通范围特效创建", () => {
    const store = createStore();
    expect(() => store.dispatch({
      type: "add-effect-clip",
      clip: {
        ...effectClip,
        templateId: "directional-transition",
        effectFamilyId: "directional-transition",
        startingStyleId: "push-pull",
        placement: {
          type: "boundary",
          beforeVideoClipId: "missing-before",
          afterVideoClipId: "missing-after",
        },
      },
    })).toThrow("片段转场只能绑定当前相邻的视频片段交界点");
    expect(store.getSnapshot().effectClips).toEqual([]);
  });

  it("可以添加、移动和删除视频片段", () => {
    const store = createStore();

    store.dispatch({ type: "add-video-clip", clip: videoClip });
    expect(store.getSnapshot().videoClips).toEqual([videoClip]);

    store.dispatch({
      type: "move-video-clip",
      clipId: videoClip.id,
      fromFrame: 40,
    });
    expect(store.getSnapshot().videoClips[0].fromFrame).toBe(40);

    store.dispatch({ type: "delete-video-clip", clipId: videoClip.id });
    expect(store.getSnapshot().videoClips).toEqual([]);
  });

  it("裁剪视频和特效片段时一次命令即可通过撤销完整恢复", () => {
    const store = createStore();
    store.dispatch({ type: "add-video-clip", clip: videoClip });
    store.dispatch({ type: "add-effect-clip", clip: effectClip });

    store.dispatch({ type: "resize-video-clip", clipId: videoClip.id, fromFrame: 5, durationInFrames: 20 });
    store.dispatch({ type: "resize-effect-clip", clipId: effectClip.id, fromFrame: 15, durationInFrames: 10 });

    store.undo();
    expect(store.getSnapshot().effectClips[0]).toEqual(effectClip);
    expect(store.getSnapshot().videoClips[0]).toEqual({ ...videoClip, fromFrame: 5, durationInFrames: 20 });

    store.undo();
    expect(store.getSnapshot().videoClips[0]).toEqual(videoClip);
  });

  it("首个横屏视频片段会把空编辑项目切换为横屏画布和导出规格", () => {
    const store = createStore();

    store.dispatch({
      type: "add-video-clip",
      clip: videoClip,
      sourceDimensions: { width: 1920, height: 1080 },
    });

    expect(store.getSnapshot().settings).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(store.getSnapshot().export).toEqual({ format: "mp4", width: 1920, height: 1080, fps: 30 });
  });

  it.each([
    ["4:3", { width: 1440, height: 1080 }, { width: 1920, height: 1440 }],
    ["21:9", { width: 2560, height: 1080 }, { width: 1920, height: 810 }],
  ])("首个%s横屏视频片段会保留素材比例创建画布和导出规格", (_ratio, sourceDimensions, expectedSettings) => {
    const store = createStore();

    store.dispatch({
      type: "add-video-clip",
      clip: videoClip,
      sourceDimensions,
    });

    expect(store.getSnapshot().settings).toEqual({ ...expectedSettings, fps: 30 });
    expect(store.getSnapshot().export).toEqual({ format: "mp4", ...expectedSettings, fps: 30 });
  });

  it.each([
    ["竖屏", { width: 1080, height: 1920 }],
    ["方形", { width: 1080, height: 1080 }],
  ])("首个%s视频片段保留默认项目规格", (_orientation, sourceDimensions) => {
    const store = createStore();

    store.dispatch({ type: "add-video-clip", clip: videoClip, sourceDimensions });

    expect(store.getSnapshot().settings).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(store.getSnapshot().export).toEqual({ format: "mp4", width: 1080, height: 1920, fps: 30 });
  });

  it("主视频轨道已有视频片段时导入横屏视频不会重写既有项目规格", () => {
    const store = createStore();
    store.dispatch({ type: "add-video-clip", clip: { ...videoClip, id: "existing-video" } });

    store.dispatch({
      type: "add-video-clip",
      clip: { ...videoClip, id: "imported-video", fromFrame: 30 },
      sourceDimensions: { width: 1920, height: 1080 },
    });

    expect(store.getSnapshot().settings).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(store.getSnapshot().export).toEqual({ format: "mp4", width: 1080, height: 1920, fps: 30 });
  });

  it("主视频轨道为空时导入横屏视频会忽略已有特效并重新匹配画布", () => {
    const store = createStore();
    store.dispatch({ type: "add-effect-clip", clip: effectClip });

    store.dispatch({
      type: "add-video-clip",
      clip: videoClip,
      sourceDimensions: { width: 1920, height: 1080 },
    });

    expect(store.getSnapshot().settings).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(store.getSnapshot().export).toEqual({ format: "mp4", width: 1920, height: 1080, fps: 30 });
    expect(store.getSnapshot().effectClips).toEqual([effectClip]);
  });

  it("重置编辑项目会清空时间轴并恢复默认画布，且可通过撤销恢复", () => {
    const store = createEditorStore(createEmptyProject({ width: 1920, height: 1080, fps: 30 }));
    store.dispatch({ type: "add-video-clip", clip: videoClip });
    store.dispatch({ type: "add-effect-clip", clip: effectClip });

    store.dispatch({ type: "reset-project" });

    expect(store.getSnapshot()).toEqual(createEmptyProject());

    store.undo();
    expect(store.getSnapshot().videoClips).toEqual([videoClip]);
    expect(store.getSnapshot().effectClips).toEqual([effectClip]);
    expect(store.getSnapshot().settings).toEqual({ width: 1920, height: 1080, fps: 30 });
  });

  it("可以添加、移动、修改参数和删除特效片段", () => {
    const store = createStore();

    store.dispatch({ type: "add-effect-clip", clip: effectClip });
    store.dispatch({
      type: "move-effect-clip",
      clipId: effectClip.id,
      fromFrame: 25,
    });
    store.dispatch({
      type: "update-effect-params",
      clipId: effectClip.id,
      params: { text: "新文", color: "#fff" },
    });

    expect(store.getSnapshot().effectClips[0]).toEqual({
      ...effectClip,
      fromFrame: 25,
      params: { text: "新文", color: "#fff" },
    });

    store.dispatch({ type: "delete-effect-clip", clipId: effectClip.id });
    expect(store.getSnapshot().effectClips).toEqual([]);
  });

  it("切换起始样式只替换表现参数，并可用一次撤销恢复原片段", () => {
    const store = createStore();
    const clip: EffectClip = {
      id: "style-effect-1",
      templateId: styleSwitchFamily.id,
      templateVersion: 1,
      effectFamilyId: styleSwitchFamily.id,
      startingStyleId: "clean",
      placement: { type: "range" },
      trackId: "effects-1",
      fromFrame: 12,
      durationInFrames: 18,
      params: { text: "用户文案", position: { x: 0.2, y: 0.8 }, color: "#111827", animation: "fade" },
    };

    store.dispatch({ type: "add-effect-clip", clip });
    store.dispatch({ type: "switch-effect-style", clipId: clip.id, startingStyleId: "tech" });

    expect(store.getSnapshot().effectClips[0]).toEqual({
      ...clip,
      startingStyleId: "tech",
      params: { text: "用户文案", position: { x: 0.2, y: 0.8 }, color: "#38bdf8", animation: "slide" },
    });
    expect(store.getSnapshot().effectClips[0].fromFrame).toBe(12);
    expect(store.getSnapshot().effectClips[0].durationInFrames).toBe(18);

    store.undo();
    expect(store.getSnapshot().effectClips[0]).toEqual(clip);
  });

  it("连续编辑后可以撤销和重做，并且新命令会清空重做栈", () => {
    const store = createStore();
    store.dispatch({ type: "add-video-clip", clip: videoClip });
    store.dispatch({ type: "add-effect-clip", clip: effectClip });
    store.dispatch({
      type: "update-effect-params",
      clipId: effectClip.id,
      params: { text: "修改" },
    });

    store.undo();
    expect(store.getSnapshot().effectClips[0].params).toEqual({ text: "原文" });
    store.undo();
    expect(store.getSnapshot().effectClips).toEqual([]);
    store.redo();
    expect(store.getSnapshot().effectClips).toEqual([effectClip]);

    store.dispatch({ type: "delete-video-clip", clipId: videoClip.id });
    store.redo();
    expect(store.getSnapshot().effectClips[0].params).toEqual({ text: "原文" });
  });

  it("通过订阅通知快照变化，取消订阅后不再通知", () => {
    const store = createStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch({ type: "add-video-clip", clip: videoClip });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toEqual(store.getSnapshot());

    unsubscribe();
    store.undo();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("拒绝非法时间和不存在的片段，并保持原快照不变", () => {
    const store = createStore();

    expect(() =>
      store.dispatch({
        type: "add-video-clip",
        clip: { ...videoClip, fromFrame: -1 },
      }),
    ).toThrow();
    expect(() =>
      store.dispatch({ type: "delete-effect-clip", clipId: "missing" }),
    ).toThrow();
    expect(store.getSnapshot()).toEqual(createEmptyProject());
  });

  it("返回的快照不能反向修改编辑器状态", () => {
    const store = createStore();
    store.dispatch({
      type: "add-effect-clip",
      clip: {
        ...effectClip,
        params: { position: { x: 10, y: 20 } },
      },
    });

    const snapshot = store.getSnapshot();
    snapshot.effectClips[0].params.text = "外部修改";
    (snapshot.effectClips[0].params.position as { x: number; y: number }).x = 99;

    expect(store.getSnapshot().effectClips[0].params.text).toBeUndefined();
    expect(
      (store.getSnapshot().effectClips[0].params.position as { x: number; y: number }).x,
    ).toBe(10);
  });
});
// 中文注释：通过 EditorStore 公共接口验证编辑命令和快照历史。
