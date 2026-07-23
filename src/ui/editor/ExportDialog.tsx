import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import { useEffect, useState, type RefObject } from "react";
import type { EditProject, ExportSettings } from "../../domain/project/model";
import {
  buildExportSettings,
  EXPORT_PRESETS,
  type ExportPresetName,
} from "../../domain/assets/preset-model";

export type ExportDialogProps = {
  open: boolean;
  project: EditProject;
  onSubmit: (settings: ExportSettings) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
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

/** 中文注释：自定义选择器中的项目规格沿用标准预设的展示格式，让用户在提交前能直接确认画面尺寸。 */
function getPresetLabel(presetName: ExportDialogPresetName, project: EditProject): string {
  if (presetName === "project") return `当前项目（${project.export.width}×${project.export.height}）`;
  return EXPORT_PRESETS[presetName].label;
}

/** 中文注释：导出对话框只提交规格，实际渲染沿用既有 /api/render 路由。 */
export function ExportDialog({ open, project, onSubmit, onClose, returnFocusRef }: ExportDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState<ExportDialogPresetName>(() => getExportPresetName(project));

  useEffect(() => {
    // 中文注释：每次重新打开均从当前视频工作区快照恢复规格，取消过的临时选择不能污染下一次导出。
    if (open) setSelectedPreset(getExportPresetName(project));
  }, [open, project]);

  /** 中文注释：选择变化只影响这次导出快照；不修改用户正在编辑的视频工作区。 */
  const selectPreset = (presetName: string) => setSelectedPreset(presetName as ExportDialogPresetName);

  /** 中文注释：非标准比例提交项目自身规格，避免自定义画布在导出时被表单覆盖。 */
  const submit = () => onSubmit(selectedPreset === "project" ? project.export : buildExportSettings(selectedPreset, project));

  /** 中文注释：关闭应用内导出对话框后返回顶栏入口，保持键盘工作流的连续性。 */
  const restoreExportTriggerFocus = (event: Event) => {
    event.preventDefault();
    window.setTimeout(() => returnFocusRef?.current?.focus(), 0);
  };

  return (
    <Dialog.Root onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="export-dialog__overlay" />
        <Dialog.Content aria-describedby="export-dialog-description" className="export-dialog__content" onCloseAutoFocus={restoreExportTriggerFocus}>
          <div aria-hidden="true" className="export-dialog__signal">↗</div>
          <div className="export-dialog__copy">
            <p className="export-dialog__eyebrow">MP4 导出</p>
            <Dialog.Title>导出视频</Dialog.Title>
            <Dialog.Description id="export-dialog-description">
              选择画面规格后，将以当前视频工作区快照在本地生成 MP4 文件。导出期间仍可继续编辑。
            </Dialog.Description>
          </div>
          <label className="export-dialog__field">
            <span>画面规格</span>
            <Select.Root onValueChange={selectPreset} value={selectedPreset}>
              <Select.Trigger aria-label="画面规格" className="export-dialog__select">
                <Select.Value>{getPresetLabel(selectedPreset, project)}</Select.Value>
                <Select.Icon aria-hidden="true" className="export-dialog__select-icon">⌄</Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="export-dialog__select-content" position="popper">
                  <Select.Viewport>
                    {selectedPreset === "project" ? (
                      <Select.Item className="export-dialog__select-item" value="project">
                        <Select.ItemText>{getPresetLabel("project", project)}</Select.ItemText>
                      </Select.Item>
                    ) : null}
                    {Object.entries(EXPORT_PRESETS).map(([value, preset]) => (
                      <Select.Item className="export-dialog__select-item" key={value} value={value}>
                        <Select.ItemText>{preset.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </label>
          <dl className="export-dialog__specifications">
            <div><dt>格式</dt><dd>MP4</dd></div>
            <div><dt>帧率</dt><dd>{project.export.fps} fps</dd></div>
            <div><dt>输出位置</dt><dd>此视频工作区的本地导出库</dd></div>
          </dl>
          <div className="export-dialog__actions">
            <Dialog.Close asChild>
              <button className="export-dialog__cancel" type="button">取消</button>
            </Dialog.Close>
            <button className="export-dialog__confirm" onClick={submit} type="button">开始导出</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// 中文注释：保留导出规格函数的 UI 层导出，便于表单外的集成代码复用同一契约。
export { buildExportSettings } from "../../domain/assets/preset-model";
