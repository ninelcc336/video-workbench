import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureWorkspaceDirectories, getWorkspacePaths } from "../workspace/workspace-paths";
import { PresetRepository } from "./preset-repository";
import { VideoTemplateRepository } from "./video-template-repository";
import { getEffectFamily } from "../../domain/templates/effect-family";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRepositories() {
  const root = await mkdtemp(join(tmpdir(), "video-effect-assets-"));
  roots.push(root);
  const paths = getWorkspacePaths(root);
  await ensureWorkspaceDirectories(paths);
  return {
    root,
    presetRepository: new PresetRepository(paths),
    videoTemplateRepository: new VideoTemplateRepository(paths),
  };
}

describe("个人资产仓储", () => {
  it("保存并读取预设，JSON 不包含视频素材字段", async () => {
    const { root, presetRepository } = await createRepositories();

    const saved = await presetRepository.savePreset(
      "emphasis-card",
      1,
      { text: "知识点" },
      "我的卡片",
      "preset-1",
      "full",
      "emphasis-card",
    );

    await expect(presetRepository.loadPreset("preset-1")).resolves.toEqual(saved);
    const raw = await readFile(join(root, "presets", "preset-1.json"), "utf8");
    const serialized = JSON.parse(raw) as { params: Record<string, unknown> };
    expect(serialized).toMatchObject({
      effectFamilyId: "emphasis-card",
      templateId: "emphasis-card",
      templateVersion: 1,
      name: "我的卡片",
      scope: "full",
    });
    expect(serialized.params).toMatchObject({ text: "知识点" });
    expect(Object.keys(serialized.params)).toEqual(
      getEffectFamily("emphasis-card", 1).parameters.map((parameter) => parameter.key),
    );
    await expect(presetRepository.listPresets()).resolves.toHaveLength(1);
  });

  it("拒绝读取缺少范围和特效族身份的开发期旧个人预设", async () => {
    const { root, presetRepository } = await createRepositories();
    const legacyPresetPath = join(root, "presets", "legacy-preset.json");
    await writeFile(
      legacyPresetPath,
      `${JSON.stringify({
        templateId: "emphasis-card",
        templateVersion: 1,
        name: "旧版卡片",
        params: { text: "保留旧文案" },
      })}\n`,
      "utf8",
    );

    await expect(presetRepository.loadPreset("legacy-preset")).rejects.toThrow("请删除后重新创建");
  });

  it("保存并读取视频模板，内容只包含相对特效布局", async () => {
    const { root, videoTemplateRepository } = await createRepositories();
    const template = {
      id: "template-1",
      name: "知识点模板",
      fps: 30,
      effectClips: [
        {
          templateId: "emphasis-card",
          templateVersion: 1,
          effectFamilyId: "emphasis-card",
          startingStyleId: "solid-card",
          placement: { type: "range" },
          trackId: "effects-1",
          fromFrame: 0,
          durationInFrames: 30,
          params: { text: "标题" },
        },
      ],
    } as const;

    await videoTemplateRepository.saveVideoTemplate(template);
    await expect(videoTemplateRepository.loadVideoTemplate("template-1")).resolves.toEqual(template);
    const raw = await readFile(join(root, "video-templates", "template-1.json"), "utf8");
    expect(JSON.stringify(JSON.parse(raw))).not.toContain("mediaId");
    expect(JSON.stringify(JSON.parse(raw))).not.toContain("filePath");
  });
});
// 中文注释：验证个人资产仓储的文件读写边界。
