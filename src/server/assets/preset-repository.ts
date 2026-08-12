import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertSafePathSegment,
  getWorkspacePaths,
  type WorkspacePaths,
} from "../workspace/workspace-paths";
import {
  createPreset,
  deserializePreset,
  serializePreset,
  type Preset,
  type PresetScope,
} from "../../domain/assets/preset-model";
// 中文注释：仓储是服务端个人资产入口，直接使用时也必须先注册当前内置特效族。
import "../../domain/templates/registry";

function presetFilePath(paths: WorkspacePaths, presetId: string): string {
  // 中文注释：资产 ID 只能作为文件名，阻止路径穿越读取工作区外文件。
  return join(paths.presets, `${assertSafePathSegment(presetId, "预设 ID")}.json`);
}

/** 中文注释：个人预设仓储只持久化白名单字段，ID 由文件名恢复。 */
export class PresetRepository {
  public readonly paths: WorkspacePaths;

  constructor(pathsOrRoot: WorkspacePaths | string) {
    this.paths = typeof pathsOrRoot === "string" ? getWorkspacePaths(pathsOrRoot) : pathsOrRoot;
  }

  /**
   * 中文注释：创建并持久化当前格式的个人预设，强制要求特效族身份并只写白名单字段；
   * 参数、范围或族版本无效时由领域模型抛错，文件写入不会产生不完整资产。
   */
  async savePreset(
    templateId: string,
    templateVersion: number,
    params: Record<string, unknown>,
    name: string,
    presetId?: string,
    scope: PresetScope = "full",
    effectFamilyId?: string,
  ): Promise<Preset> {
    // 中文注释：默认 ID 使用随机 UUID；测试或上层需要稳定名称时可以显式传入。
    const resolvedPresetId = presetId ?? crypto.randomUUID();
    if (!effectFamilyId) throw new Error("保存个人预设必须指定特效族 ID");
    const preset = createPreset(resolvedPresetId, templateId, templateVersion, name, params, scope, effectFamilyId);
    await mkdir(this.paths.presets, { recursive: true });
    await writeFile(presetFilePath(this.paths, preset.id), `${JSON.stringify(serializePreset(preset), null, 2)}\n`, "utf8");
    return structuredClone(preset);
  }

  async loadPreset(presetId: string): Promise<Preset> {
    let raw: string;
    try {
      raw = await readFile(presetFilePath(this.paths, presetId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`找不到个人预设“${presetId}”`);
      }
      throw error;
    }
    try {
      return deserializePreset(JSON.parse(raw), presetId);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`个人预设“${presetId}”的 JSON 文件已损坏`);
      }
      throw error;
    }
  }

  async listPresets(): Promise<Preset[]> {
    let fileNames: string[];
    try {
      fileNames = await readdir(this.paths.presets);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const presets: Preset[] = [];
    for (const fileName of fileNames.filter((name) => name.endsWith(".json"))) {
      const presetId = fileName.slice(0, -".json".length);
      presets.push(await this.loadPreset(presetId));
    }
    return presets.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }

  /** 中文注释：删除个人预设只删除其 JSON 记录，不影响模板注册表或项目片段。 */
  async deletePreset(presetId: string): Promise<void> {
    await rm(presetFilePath(this.paths, presetId), { force: false });
  }
}

/** 中文注释：提供与工作区适配器一致的仓储创建入口。 */
export function createPresetRepository(rootPath: string): PresetRepository {
  return new PresetRepository(rootPath);
}
