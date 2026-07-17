import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../domain/project/factories";
import type { EditProject } from "../domain/project/model";
import { getTemplate, getTemplateDefaultParams } from "../domain/templates/registry";
import { EditorComposition, getCompositionDurationInFrames, getCompositionMediaSources } from "./EditorComposition";

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
    expect((element as React.ReactElement<{ children: unknown[] }>).props.children).toHaveLength(2);
  });
});
