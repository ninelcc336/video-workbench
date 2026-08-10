import type { EditorStore } from "../editor/editor-store";
import type { EditProject, ExportSettings } from "../project/model";
import { getTemplate, normalizeParams } from "../templates/registry";

/** 中文注释：预设范围决定套用时是否保留当前特效片段的内容参数。 */
export type PresetScope = "style" | "full";

/** 中文注释：个人预设只引用特效模板，并保存用户主动调整的参数。 */
export type Preset = {
  id: string;
  templateId: string;
  templateVersion: number;
  name: string;
  scope: PresetScope;
  params: Record<string, unknown>;
};

/** 中文注释：仓储写入的结构不包含 ID，ID 由文件名提供，避免重复保存资产元数据。 */
export type SerializedPreset = Omit<Preset, "id" | "scope"> & { scope?: PresetScope };

export type ExportPresetName = "vertical" | "horizontal" | "square";

export const EXPORT_PRESETS: Readonly<Record<ExportPresetName, { label: string; width: number; height: number }>> = {
  vertical: { label: "竖屏（1080×1920）", width: 1080, height: 1920 },
  horizontal: { label: "横屏（1920×1080）", width: 1920, height: 1080 },
  square: { label: "方形（1080×1080）", width: 1080, height: 1080 },
};

function cloneParams(params: Record<string, unknown>): Record<string, unknown> {
  // 中文注释：深拷贝参数，保证预设和编辑器历史快照互不影响。
  return structuredClone(params);
}

/** 中文注释：创建预设时校验身份字段，并隔离调用方传入的参数对象。 */
export function createPreset(
  id: string,
  templateId: string,
  templateVersion: number,
  name: string,
  params: Record<string, unknown>,
  scope: PresetScope = "full",
): Preset {
  if (!id.trim() || !templateId.trim()) {
    throw new Error("预设 ID 和特效模板 ID 不能为空");
  }
  if (!Number.isInteger(templateVersion) || templateVersion <= 0) {
    throw new RangeError("特效模板版本必须是正整数");
  }
  if (!name.trim()) {
    throw new Error("预设名称不能为空");
  }
  if (scope !== "style" && scope !== "full") {
    throw new Error("预设范围无效");
  }

  return {
    id,
    templateId,
    templateVersion,
    name: name.trim(),
    scope,
    params: cloneParams(params),
  };
}

/**
 * 中文注释：序列化时明确白名单，防止把编辑项目或媒体路径混入个人预设。
 * 完整预设沿用缺省范围的旧 JSON 形状；只有样式预设需要显式写出 scope。
 */
export function serializePreset(preset: Preset): SerializedPreset {
  return {
    templateId: preset.templateId,
    templateVersion: preset.templateVersion,
    name: preset.name,
    ...(preset.scope === "style" ? { scope: "style" as const } : {}),
    params: cloneParams(preset.params),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 中文注释：读取个人预设的持久化数据；旧文件缺少 scope 时按完整预设恢复，不能丢弃内容参数。
 * 数据结构或范围非法时抛错，由资产仓储转换为对应的读取错误。
 */
export function deserializePreset(value: unknown, presetId: string): Preset {
  if (
    !isRecord(value) ||
    typeof value.templateId !== "string" ||
    !Number.isInteger(value.templateVersion) ||
    typeof value.name !== "string" ||
    !isRecord(value.params)
  ) {
    throw new Error(`个人预设“${presetId}”的数据格式无效`);
  }

  const scope = value.scope === undefined ? "full" : value.scope;
  if (scope !== "style" && scope !== "full") {
    throw new Error(`个人预设“${presetId}”的范围无效`);
  }
  const templateVersion = value.templateVersion as number;

  return createPreset(
    presetId,
    value.templateId,
    templateVersion,
    value.name,
    value.params,
    scope,
  );
}

/** 中文注释：应用预设只能走 EditorStore 的公共命令，因此自动进入撤销历史。 */
export function applyPreset(
  store: EditorStore,
  preset: Preset,
  effectClipId: string,
): boolean {
  const target = store.getSnapshot().effectClips.find((clip) => clip.id === effectClipId);
  if (!target) throw new Error(`未找到特效片段：${effectClipId}`);
  let normalizedParams: Record<string, unknown>;
  let compatible = true;
  try {
    // 中文注释：版本匹配时保留用户保存的公开参数，避免套用预设时意外改写编辑结果。
    if (target.templateId !== preset.templateId || target.templateVersion !== preset.templateVersion) throw new Error("预设模板与当前特效不兼容");
    getTemplate(preset.templateId, preset.templateVersion);
    normalizedParams = cloneParams(preset.params);
  } catch {
    // 中文注释：旧模板版本不可用时回退到当前模板的安全默认参数，不把不兼容数据写入项目。
    normalizedParams = normalizeParams(getTemplate(target.templateId, target.templateVersion), {});
    compatible = false;
  }
  store.dispatch({
    type: "update-effect-params",
    clipId: effectClipId,
    params: cloneParams(normalizedParams),
  });
  return compatible;
}

/** 中文注释：将界面上的三个导出预设转换为项目统一的 MP4 导出设置。 */
export function buildExportSettings(
  preset: ExportPresetName,
  _project: EditProject,
): ExportSettings {
  const dimensions = EXPORT_PRESETS[preset];
  if (!dimensions) {
    throw new Error("不支持的导出规格");
  }

  return {
    format: "mp4",
    width: dimensions.width,
    height: dimensions.height,
    fps: _project.export.fps,
  };
}
