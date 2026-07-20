import { useState } from "react";
import type { EditProject, ExportSettings } from "../../domain/project/model";
import type { RenderJobStatus } from "../../server/render/render-job";
import {
  buildExportSettings,
  EXPORT_PRESETS,
  type ExportPresetName,
} from "../../domain/assets/preset-model";

export type ExportDialogProps = {
  open: boolean;
  project: EditProject;
  outputPath?: string;
  renderStatus?: RenderJobStatus;
  error?: string;
  onSubmit: (settings: ExportSettings) => void;
  onClose: () => void;
};

const renderStatusLabels: Record<RenderJobStatus, string> = {
  preparing: "准备中",
  rendering: "渲染中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

/** 中文注释：非标准项目比例需要作为对话框的当前项目选项保留，不能强行映射到标准预设。 */
type ExportDialogPresetName = ExportPresetName | "project";

/** 中文注释：对话框打开时从项目导出规格还原预设，避免 UI 覆盖已匹配的横屏项目。 */
function getExportPresetName(project: EditProject): ExportDialogPresetName {
  const preset = Object.entries(EXPORT_PRESETS).find(([, dimensions]) => (
    dimensions.width === project.export.width && dimensions.height === project.export.height
  ));
  return preset ? preset[0] as ExportPresetName : "project";
}

/** 中文注释：导出对话框只提交规格，实际渲染沿用既有 /api/render 路由。 */
export function ExportDialog({
  open,
  project,
  outputPath,
  renderStatus,
  error,
  onSubmit,
  onClose,
}: ExportDialogProps) {
  if (!open) return null;

  return <ExportDialogContent {...{ project, outputPath, renderStatus, error, onSubmit, onClose }} />;
}

function ExportDialogContent({
  project,
  outputPath,
  renderStatus,
  error,
  onSubmit,
  onClose,
}: Omit<ExportDialogProps, "open">) {
  const [selectedPreset, setSelectedPreset] = useState<ExportDialogPresetName>(() => getExportPresetName(project));
  // 中文注释：非标准比例没有对应预设时，提交项目自身规格，避免自动横屏比例被导出表单覆盖。
  const submit = () => onSubmit(selectedPreset === "project" ? project.export : buildExportSettings(selectedPreset, project));

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
      <h2 id="export-dialog-title">导出视频</h2>
      <label>
        画面规格
        <select
          value={selectedPreset}
          aria-label="画面规格"
          onChange={(event) => setSelectedPreset(event.target.value as ExportDialogPresetName)}
        >
          {selectedPreset === "project" && <option value="project">当前项目（{project.export.width}×{project.export.height}）</option>}
          {Object.entries(EXPORT_PRESETS).map(([value, preset]) => (
            <option key={value} value={value}>{preset.label}</option>
          ))}
        </select>
      </label>
      <p>格式：MP4　帧率：{project.export.fps}fps</p>
      {outputPath ? <p>输出路径：{outputPath}</p> : null}
      {renderStatus ? <p role="status">渲染状态：{renderStatusLabels[renderStatus]}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" onClick={submit}>开始导出</button>
      </div>
    </div>
  );
}

// 中文注释：保留导出规格函数的 UI 层导出，便于表单外的集成代码复用同一契约。
export { buildExportSettings } from "../../domain/assets/preset-model";
