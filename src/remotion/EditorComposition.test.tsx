import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyProject } from "../domain/project/factories";
import type { EditProject } from "../domain/project/model";
import { getTemplate, getTemplateDefaultParams } from "../domain/templates/registry";
import { registerEffectFamily } from "../domain/templates/effect-family";
import type { EffectFamilyDefinition } from "../domain/templates/types";
import {
  EditorComposition,
  getCompositionDurationInFrames,
  getCompositionMediaSources,
  getEffectLayerRenderProps,
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
      trackId: "effects-1",
      fromFrame: 15,
      durationInFrames: 45,
      params: getTemplateDefaultParams(
        // 中文注释：测试使用真实注册表默认参数，保证预览和导出消费同一模板契约。
        getTemplate("card-overlay", 1),
      ),
    },
  ];
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
    const bubbleTemplate = getTemplate("bubble-decoration", 1);
    const clips = [
      project.effectClips[0],
      {
        id: "effect-bubble",
        templateId: bubbleTemplate.id,
        templateVersion: bubbleTemplate.version,
        trackId: "effects-1",
        fromFrame: 10,
        durationInFrames: bubbleTemplate.defaultDurationInFrames,
        params: getTemplateDefaultParams(bubbleTemplate),
      },
    ];

    for (const clip of clips) {
      const { template, renderProps } = getEffectLayerRenderProps(project, clip, 12);

      // 中文注释：使用片段内第 12 帧验证入场和漂浮动画都能拿到有效局部帧。
      expect(renderProps.frame).toBe(12);
      expect(renderToStaticMarkup(template.render(renderProps))).toContain(
        `data-template-id="${template.id}"`,
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
      migrations: [],
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
      trackId: "effects-1",
      fromFrame: 0,
      durationInFrames: 20,
      params: {},
    }];

    const { template, renderProps } = getEffectLayerRenderProps(project, project.effectClips[0], 8);

    expect(template.id).toBe(family.id);
    expect(renderToStaticMarkup(template.render(renderProps))).toContain(
      `data-effect-family="${family.id}"`,
    );
  });
});
