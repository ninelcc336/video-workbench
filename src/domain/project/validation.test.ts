import { describe, expect, it } from "vitest";
import { createEmptyProject } from "./factories";
import type { EditProject } from "./model";
import { validateProject } from "./validation";

/** 中文注释：构造带一个视频和一个范围特效的合法项目，供字段级校验用例复用。 */
function createProjectWithClips(): EditProject {
  return {
    ...createEmptyProject(),
    videoClips: [
      {
        id: "video-1",
        mediaId: "media-1",
        fromFrame: 0,
        sourceStartFrame: 0,
        durationInFrames: 90,
        audioEnabled: true,
      },
    ],
    effectClips: [
      {
        id: "effect-1",
        templateId: "emphasis-card",
        templateVersion: 1,
        effectFamilyId: "emphasis-card",
        startingStyleId: "solid-card",
        placement: { type: "range" },
        trackId: "effects-1",
        fromFrame: 30,
        durationInFrames: 30,
        params: { text: "重点" },
      },
    ],
  };
}

describe("编辑项目校验", () => {
  it("接受符合时间轴规则的项目", () => {
    const result = validateProject(createProjectWithClips());

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("报告重复片段 ID 的字段级错误", () => {
    const project = createProjectWithClips();
    project.effectClips[0].id = "video-1";

    const result = validateProject(project);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "effectClips.0.id",
          code: "duplicate_id",
        }),
      ]),
    );
  });

  it("拒绝主视频轨道上重叠的视频片段", () => {
    const project = createProjectWithClips();
    project.videoClips.push({
      id: "video-2",
      mediaId: "media-2",
      fromFrame: 60,
      sourceStartFrame: 0,
      durationInFrames: 60,
      audioEnabled: false,
    });

    const result = validateProject(project);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "videoClips.1.fromFrame",
          code: "overlap",
        }),
      ]),
    );
  });

  it("拒绝缺少模板 ID、非法时间范围和小数帧", () => {
    const project = createProjectWithClips();
    project.effectClips[0].templateId = "";
    project.effectClips[0].fromFrame = -1;
    project.effectClips[0].durationInFrames = 0;

    const result = validateProject(project);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "effectClips.0.templateId",
          code: "missing_template_id",
        }),
        expect.objectContaining({
          path: "effectClips.0.fromFrame",
          code: "invalid_frame",
        }),
        expect.objectContaining({
          path: "effectClips.0.durationInFrames",
          code: "invalid_duration",
        }),
      ]),
    );
  });

  it("拒绝不支持的导出格式", () => {
    const project = createProjectWithClips();
    project.export = { ...project.export, format: "webm" as "mp4" };

    const result = validateProject(project);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "export.format",
          code: "unsupported_format",
        }),
      ]),
    );
  });
});
// 中文注释：验证编辑项目的边界错误能被稳定报告。
