import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertSafePathSegment,
  getWorkspacePaths,
  type WorkspacePaths,
} from "../workspace/workspace-paths";
import {
  createPreset,
  serializePreset,
  type Preset,
  type SerializedPreset,
} from "../../domain/assets/preset-model";

function presetFilePath(paths: WorkspacePaths, presetId: string): string {
  // 中文注释：资产 ID 只能作为文件名，阻止路径穿越读取工作区外文件。
  return join(paths.presets, `${assertSafePathSegment(presetId, "预设 ID")}.json`);
}

function parsePreset(value: unknown, presetId: string): Preset {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as SerializedPreset).templateId !== "string" ||
    !Number.isInteger((value as SerializedPreset).templateVersion) ||
    typeof (value as SerializedPreset).name !== "string" ||
    typeof (value as SerializedPreset).params !== "object" ||
    (value as SerializedPreset).params === null ||
    Array.isArray((value as SerializedPreset).params)
  ) {
    throw new Error(`个人预设“${presetId}”的数据格式无效`);
  }
  const data = value as SerializedPreset;
  return createPreset(
    presetId,
    data.templateId,
    data.templateVersion,
    data.name,
    data.params,
  );
}

/** 中文注释：个人预设仓储只持久化白名单字段，ID 由文件名恢复。 */
export class PresetRepository {
  public readonly paths: WorkspacePaths;

  constructor(pathsOrRoot: WorkspacePaths | string) {
    this.paths = typeof pathsOrRoot === "string" ? getWorkspacePaths(pathsOrRoot) : pathsOrRoot;
  }

  async savePreset(
    templateId: string,
    templateVersion: number,
    params: Record<string, unknown>,
    name: string,
    presetId?: string,
  ): Promise<Preset> {
    // 中文注释：默认 ID 使用随机 UUID；测试或上层需要稳定名称时可以显式传入。
    const resolvedPresetId = presetId ?? crypto.randomUUID();
    const preset = createPreset(resolvedPresetId, templateId, templateVersion, name, params);
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
      return parsePreset(JSON.parse(raw), presetId);
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
}

/** 中文注释：提供与工作区适配器一致的仓储创建入口。 */
export function createPresetRepository(rootPath: string): PresetRepository {
  return new PresetRepository(rootPath);
}
