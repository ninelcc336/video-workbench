import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertSafePathSegment,
  getWorkspacePaths,
  type WorkspacePaths,
} from "../workspace/workspace-paths";
import {
  serializeVideoTemplate,
  type VideoTemplate,
  type VideoTemplateEffectClip,
} from "../../domain/assets/video-template-model";

function videoTemplateFilePath(paths: WorkspacePaths, templateId: string): string {
  // 中文注释：模板 ID 只能映射为工作区内的单个 JSON 文件名。
  return join(
    paths.videoTemplates,
    `${assertSafePathSegment(templateId, "视频模板 ID")}.json`,
  );
}

function parseVideoTemplate(value: unknown, templateId: string): VideoTemplate {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as VideoTemplate).name !== "string" ||
    !Array.isArray((value as VideoTemplate).effectClips)
  ) {
    throw new Error(`视频模板“${templateId}”的数据格式无效`);
  }

  const data = value as { name: string; effectClips: unknown[] };
  const effectClips = data.effectClips.map((clip) => {
    if (
      typeof clip !== "object" ||
      clip === null ||
      typeof (clip as VideoTemplateEffectClip).templateId !== "string" ||
      typeof (clip as VideoTemplateEffectClip).trackId !== "string" ||
      !Number.isInteger((clip as VideoTemplateEffectClip).templateVersion) ||
      !Number.isInteger((clip as VideoTemplateEffectClip).fromFrame) ||
      !Number.isInteger((clip as VideoTemplateEffectClip).durationInFrames) ||
      typeof (clip as VideoTemplateEffectClip).params !== "object" ||
      (clip as VideoTemplateEffectClip).params === null
    ) {
      throw new Error(`视频模板“${templateId}”包含无效特效片段`);
    }
    const item = clip as VideoTemplateEffectClip;
    if (item.fromFrame < 0 || item.durationInFrames <= 0) {
      throw new Error(`视频模板“${templateId}”包含非法时间范围`);
    }
    return {
      templateId: item.templateId,
      templateVersion: item.templateVersion,
      trackId: item.trackId,
      fromFrame: item.fromFrame,
      durationInFrames: item.durationInFrames,
      params: structuredClone(item.params),
    };
  });

  return {
    id: templateId,
    name: data.name,
    effectClips,
  };
}

/** 中文注释：视频模板仓储只保存可复用的特效布局，不保存视频素材或文件路径。 */
export class VideoTemplateRepository {
  public readonly paths: WorkspacePaths;

  constructor(pathsOrRoot: WorkspacePaths | string) {
    this.paths = typeof pathsOrRoot === "string" ? getWorkspacePaths(pathsOrRoot) : pathsOrRoot;
  }

  async saveVideoTemplate(template: VideoTemplate): Promise<VideoTemplate> {
    const safeId = assertSafePathSegment(template.id, "视频模板 ID");
    if (!template.name.trim()) {
      throw new Error("视频模板名称不能为空");
    }
    await mkdir(this.paths.videoTemplates, { recursive: true });
    const saved = structuredClone(template);
    await writeFile(
      videoTemplateFilePath(this.paths, safeId),
      `${JSON.stringify(serializeVideoTemplate(saved), null, 2)}\n`,
      "utf8",
    );
    return saved;
  }

  async loadVideoTemplate(templateId: string): Promise<VideoTemplate> {
    let raw: string;
    try {
      raw = await readFile(videoTemplateFilePath(this.paths, templateId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`找不到视频模板“${templateId}”`);
      }
      throw error;
    }
    try {
      return parseVideoTemplate(JSON.parse(raw), templateId);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`视频模板“${templateId}”的 JSON 文件已损坏`);
      }
      throw error;
    }
  }

  async listVideoTemplates(): Promise<VideoTemplate[]> {
    let fileNames: string[];
    try {
      fileNames = await readdir(this.paths.videoTemplates);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const templates: VideoTemplate[] = [];
    for (const fileName of fileNames.filter((name) => name.endsWith(".json"))) {
      templates.push(await this.loadVideoTemplate(fileName.slice(0, -".json".length)));
    }
    return templates.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }
}

/** 中文注释：提供与其他本地资产仓储一致的工厂函数。 */
export function createVideoTemplateRepository(rootPath: string): VideoTemplateRepository {
  return new VideoTemplateRepository(rootPath);
}
