import type { EditorStore } from "../editor/editor-store";
import type { EditProject, ExportSettings } from "../project/model";

/** 中文注释：个人预设只引用特效模板，并保存用户主动调整的参数。 */
export type Preset = {
  id: string;
  templateId: string;
  templateVersion: number;
  name: string;
  params: Record<string, unknown>;
};

/** 中文注释：仓储写入的结构不包含 ID，ID 由文件名提供，避免重复保存资产元数据。 */
export type SerializedPreset = Omit<Preset, "id">;

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

  return {
    id,
    templateId,
    templateVersion,
    name: name.trim(),
    params: cloneParams(params),
  };
}

/** 中文注释：序列化时明确白名单，防止把编辑项目或媒体路径混入个人预设。 */
export function serializePreset(preset: Preset): SerializedPreset {
  return {
    templateId: preset.templateId,
    templateVersion: preset.templateVersion,
    name: preset.name,
    params: cloneParams(preset.params),
  };
}

/** 中文注释：应用预设只能走 EditorStore 的公共命令，因此自动进入撤销历史。 */
export function applyPreset(
  store: EditorStore,
  preset: Preset,
  effectClipId: string,
): void {
  store.dispatch({
    type: "update-effect-params",
    clipId: effectClipId,
    params: cloneParams(preset.params),
  });
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
    fps: 30,
  };
}
