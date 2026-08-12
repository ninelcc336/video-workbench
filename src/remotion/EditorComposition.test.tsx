import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyProject } from "../domain/project/factories";
import type { EditProject } from "../domain/project/model";
import {
  createEffectFamilyInstance,
  getEffectFamily,
} from "../domain/templates/effect-family";
import { registerEffectFamily } from "../domain/templates/effect-family";
import type { EffectFamilyDefinition } from "../domain/templates/types";
import {
  EditorComposition,
  getCompositionDurationInFrames,
  getCompositionMediaSources,
  getEffectLayerRenderProps,
  getTransitionLayerRenderProps,
} from "./EditorComposition";

function createProject(): EditProject {
  const project = createEmptyProject();
  project.videoClips = [
    {
      id: "video-1",
      mediaId: "media-1",
      fromFrame: 0,
      sourceStartFrame: 3,
      durationInFrames: 60,
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
      fromFrame: 15,
      durationInFrames: 45,
      params: createEffectFamilyInstance(getEffectFamily("card-overlay", 1), "default", "16:9").params,
    },
  ];
  return project;
}

function createBoundaryTransitionProject(): EditProject {
  const project = createEmptyProject({ width: 1920, height: 1080 });
  project.videoClips = [
    {
      id: "before-video",
      mediaId: "before-media",
      fromFrame: 0,
      sourceStartFrame: 0,
      durationInFrames: 30,
      sourceDurationInFrames: 32,
      audioEnabled: true,
    },
    {
      id: "after-video",
      mediaId: "after-media",
      fromFrame: 30,
      sourceStartFrame: 10,
      durationInFrames: 45,
      sourceDurationInFrames: 100,
      audioEnabled: false,
    },
  ];
  project.effectClips = [{
    id: "boundary-transition",
    templateId: "basic-transition",
    templateVersion: 1,
    effectFamilyId: "basic-transition",
    startingStyleId: "default",
    placement: {
      type: "boundary",
      beforeVideoClipId: "before-video",
      afterVideoClipId: "after-video",
    },
    trackId: "effects-1",
    fromFrame: 999,
    durationInFrames: 8,
    params: createEffectFamilyInstance(getEffectFamily("basic-transition", 1), "default", "16:9").params,
  }];
  return project;
}

describe("共享 Remotion 编辑组合", () => {
  it("根据所有视频和特效片段计算组合总帧数", () => {
    const project = createProject();

    expect(getCompositionDurationInFrames(project)).toBe(60);
  });

  it("从同一个项目快照收集视频素材和音频开关", () => {
    const project = createProject();

    expect(getCompositionMediaSources(project, { "media-1": "file:///media-1.mp4" })).toEqual([
      {
        clipId: "video-1",
        mediaId: "media-1",
        src: "file:///media-1.mp4",
        audioEnabled: true,
      },
    ]);
  });

  it("缺失素材时返回明确中文错误", () => {
    expect(() => getCompositionMediaSources(createProject(), {})).toThrow(
      "缺少视频素材：media-1",
    );
  });

  it("返回包含视频层和特效层的 Remotion 元素", () => {
    const element = EditorComposition({
      project: createProject(),
      mediaSources: { "media-1": "file:///media-1.mp4" },
    });

    expect(element).toBeTruthy();
    const rootChildren = (element as React.ReactElement<{ children: React.ReactElement[] }>).props.children;
    expect(rootChildren).toHaveLength(2);
    const effectSequence = (rootChildren[1] as unknown as React.ReactElement<{ style: Record<string, unknown> }>[])[0];
    expect(effectSequence.props.style).toMatchObject({ zIndex: 1 });
  });

  it("通过真实注册表为卡片和气泡生成有效特效渲染输入", () => {
    const project = createProject();
    const bubbleFamily = getEffectFamily("bubble-decoration", 1);
    const bubbleInstance = createEffectFamilyInstance(bubbleFamily, "default", "16:9");
    const clips = [
      project.effectClips[0],
      {
        id: "effect-bubble",
        templateId: bubbleFamily.id,
        templateVersion: bubbleFamily.version,
        effectFamilyId: bubbleFamily.id,
        startingStyleId: "default",
        placement: { type: "range" as const },
        trackId: "effects-1",
        fromFrame: 10,
        durationInFrames: bubbleInstance.durationInFrames,
        params: bubbleInstance.params,
      },
    ];

    for (const clip of clips) {
      const { family, renderProps } = getEffectLayerRenderProps(project, clip, 12);

      // 中文注释：使用片段内第 12 帧验证入场和漂浮动画都能拿到有效局部帧。
      expect(renderProps.frame).toBe(12);
      expect(renderToStaticMarkup(family.render(renderProps))).toContain(
        `data-template-id="${family.id}"`,
      );
    }
  });

  it("视频层在预览画布内尽量铺满且保持比例", () => {
    const element = EditorComposition({
      project: createProject(),
      mediaSources: { "media-1": "file:///media-1.mp4" },
    });
    const rootChildren = (element as React.ReactElement<{ children: React.ReactElement[] }>).props.children;
    const videoSequence = (rootChildren[0] as unknown as Array<React.ReactElement<{
      children: React.ReactElement<{ style: Record<string, unknown> }>;
    }>>)[0];
    const video = videoSequence.props.children as React.ReactElement<{ style: Record<string, unknown> }>;

    expect(video.props.style).toMatchObject({
      objectFit: "contain",
    });
  });

  it("真实转场提供前后视频的局部帧、进度、画布和静音画面节点", () => {
    const project = createBoundaryTransitionProject();
    const clip = project.effectClips[0];
    const result = getTransitionLayerRenderProps(project, clip, 4, {
      "before-media": "file:///before.mp4",
      "after-media": "file:///after.mp4",
    });

    expect(result).not.toBeNull();
    expect(result?.renderProps).toMatchObject({
      localFrame: 4,
      canvas: { width: 1920, height: 1080 },
      before: {
        clipId: "before-video",
        sourceFrame: 31,
        frozen: true,
      },
      after: {
        clipId: "after-video",
        sourceFrame: 14,
        frozen: false,
      },
    });
    expect(result?.renderProps.progress).toBeGreaterThan(0);
    expect(result?.renderProps.progress).toBeLessThan(1);

    for (const frame of [result?.renderProps.before, result?.renderProps.after]) {
      const sequence = frame?.node as React.ReactElement<{
        durationInFrames: number;
        from: number;
        layout: string;
        children: React.ReactElement<{ muted: boolean; startFrom: number; trimAfter: number }>;
      }>;
      const video = sequence.props.children;
      expect(sequence.props).toMatchObject({
        durationInFrames: 1,
        from: 4,
        layout: "none",
      });
      expect(video.props.muted).toBe(true);
      expect(video.props.trimAfter).toBe(1);
    }
    const beforeSequence = result?.renderProps.before.node as React.ReactElement<{
      children: React.ReactElement<{ startFrom: number }>;
    }>;
    const afterSequence = result?.renderProps.after.node as React.ReactElement<{
      children: React.ReactElement<{ startFrom: number }>;
    }>;
    expect(beforeSequence.props.children.props.startFrom).toBe(31);
    expect(afterSequence.props.children.props.startFrom).toBe(14);
  });

  it("真实转场使用派生范围，不延长项目总时长，并在组合中置于视频之上", () => {
    const project = createBoundaryTransitionProject();
    expect(getCompositionDurationInFrames(project)).toBe(75);

    const longTransitionProject = createBoundaryTransitionProject();
    longTransitionProject.effectClips[0].durationInFrames = 100;
    expect(getCompositionDurationInFrames(longTransitionProject)).toBe(75);

    const element = EditorComposition({
      project,
      mediaSources: {
        "before-media": "file:///before.mp4",
        "after-media": "file:///after.mp4",
      },
    });
    const rootChildren = (element as React.ReactElement<{ children: React.ReactElement[] }>).props.children;
    const effectSequences = rootChildren[1] as unknown as React.ReactElement[];
    const transitionSequence = effectSequences[0] as React.ReactElement<{
      style: Record<string, unknown>;
      from: number;
      durationInFrames: number;
    }>;

    expect(transitionSequence.props).toMatchObject({
      from: 30,
      durationInFrames: 8,
      style: { zIndex: 2 },
    });
  });

  it("新版特效族片段通过统一声明进入编辑组合", () => {
    const family: EffectFamilyDefinition = {
      id: "composition-fixture",
      version: 1,
      category: "decorative-animation",
      name: "组合测试族",
      description: "验证新版族进入 Remotion 组合。",
      purposeTags: ["highlight"],
      visualDirections: ["tech-data"],
      defaultDurationInFrames: 20,
      parameters: [],
      startingStyles: [{
        id: "default",
        name: "默认",
        visualDirection: "tech-data",
        defaultParams: {},
      }],
      aspectRatioDefaults: {},
      render: (props) => createElement("div", { "data-effect-family": props.effectFamilyId }),
    };
    registerEffectFamily(family);

    const project = createProject();
    project.effectClips = [{
      id: "effect-family-1",
      templateId: family.id,
      templateVersion: family.version,
      effectFamilyId: family.id,
      startingStyleId: "default",
      placement: { type: "range" },
      trackId: "effects-1",
      fromFrame: 0,
      durationInFrames: 20,
      params: {},
    }];

    const { family: resolvedFamily, renderProps } = getEffectLayerRenderProps(project, project.effectClips[0], 8);

    expect(resolvedFamily.id).toBe(family.id);
    expect(renderToStaticMarkup(resolvedFamily.render(renderProps))).toContain(
      `data-effect-family="${family.id}"`,
    );
  });
});
