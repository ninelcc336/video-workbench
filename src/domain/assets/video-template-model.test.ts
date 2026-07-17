import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../project/factories";
import type { EffectClip, VideoClip } from "../project/model";
import { createEditorStore } from "../editor/editor-store";
import {
  applyVideoTemplate,
  createVideoTemplate,
  type VideoTemplate,
} from "./video-template-model";

const videoClip: VideoClip = {
  id: "video-1",
  mediaId: "media-1",
  fromFrame: 0,
  sourceStartFrame: 0,
  durationInFrames: 120,
  audioEnabled: true,
};

const effectClip: EffectClip = {
  id: "effect-1",
  templateId: "card-overlay",
  templateVersion: 1,
  trackId: "effects-1",
  fromFrame: 30,
  durationInFrames: 20,
  params: { text: "标题" },
};

describe("视频模板模型", () => {
  it("保存特效片段的相对布局，不保存媒体 ID 或文件路径", () => {
    const project = { ...createEmptyProject(), videoClips: [videoClip], effectClips: [effectClip] };
    const template = createVideoTemplate("template-1", "知识点模板", project);

    expect(template.effectClips).toEqual([
      {
        templateId: "card-overlay",
        templateVersion: 1,
        trackId: "effects-1",
        fromFrame: 0,
        durationInFrames: 20,
        params: { text: "标题" },
      },
    ]);
    expect(JSON.stringify(template)).not.toContain("mediaId");
    expect(JSON.stringify(template)).not.toContain("filePath");
  });

  it("套用模板时以目标起点生成新特效，保留既有视频片段并支持撤销", () => {
    const template: VideoTemplate = {
      id: "template-1",
      name: "知识点模板",
      effectClips: [
        {
          templateId: "card-overlay",
          templateVersion: 1,
          trackId: "effects-1",
          fromFrame: 10,
          durationInFrames: 20,
          params: { text: "模板标题" },
        },
      ],
    };
    const store = createEditorStore({ ...createEmptyProject(), videoClips: [videoClip] });

    applyVideoTemplate(store, template, 60, () => "generated-effect-1");

    expect(store.getSnapshot().videoClips).toEqual([videoClip]);
    expect(store.getSnapshot().effectClips).toEqual([
      {
        ...template.effectClips[0],
        id: "generated-effect-1",
        fromFrame: 70,
      },
    ]);
    store.undo();
    expect(store.getSnapshot().effectClips).toEqual([]);
  });
});
