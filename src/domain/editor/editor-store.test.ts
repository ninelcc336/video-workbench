import { describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../project/factories";
import type { EditProject, EffectClip, VideoClip } from "../project/model";
import { createEditorStore } from "./editor-store";

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
  trackId: "effects-1",
  fromFrame: 10,
  durationInFrames: 20,
  params: { text: "原文" },
};

function createStore() {
  return createEditorStore(createEmptyProject());
}

describe("命令式编辑器核心", () => {
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
