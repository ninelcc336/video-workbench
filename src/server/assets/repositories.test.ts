import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureWorkspaceDirectories, getWorkspacePaths } from "../workspace/workspace-paths";
import { PresetRepository } from "./preset-repository";
import { VideoTemplateRepository } from "./video-template-repository";

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
      "card-overlay",
      1,
      { text: "知识点" },
      "我的卡片",
      "preset-1",
    );

    await expect(presetRepository.loadPreset("preset-1")).resolves.toEqual(saved);
    const raw = await readFile(join(root, "presets", "preset-1.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({
      templateId: "card-overlay",
      templateVersion: 1,
      name: "我的卡片",
      params: { text: "知识点" },
    });
    await expect(presetRepository.listPresets()).resolves.toHaveLength(1);
  });

  it("兼容读取缺少范围字段的旧个人预设，并按完整预设保留内容", async () => {
    const { root, presetRepository } = await createRepositories();
    const legacyPresetPath = join(root, "presets", "legacy-preset.json");
    await writeFile(
      legacyPresetPath,
      `${JSON.stringify({
        templateId: "card-overlay",
        templateVersion: 1,
        name: "旧版卡片",
        params: { text: "保留旧文案" },
      })}\n`,
      "utf8",
    );

    await expect(presetRepository.loadPreset("legacy-preset")).resolves.toEqual({
      id: "legacy-preset",
      templateId: "card-overlay",
      templateVersion: 1,
      name: "旧版卡片",
      scope: "full",
      params: { text: "保留旧文案" },
    });
  });

  it("保存并读取视频模板，内容只包含相对特效布局", async () => {
    const { root, videoTemplateRepository } = await createRepositories();
    const template = {
      id: "template-1",
      name: "知识点模板",
      effectClips: [
        {
          templateId: "card-overlay",
          templateVersion: 1,
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
