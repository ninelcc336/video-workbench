import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { Preset, PresetScope } from "../../domain/assets/preset-model";

export type PresetDialogProps = {
  open: boolean;
  templateName?: string;
  initialName?: string;
  presets?: Preset[];
  error?: string;
  canSave?: boolean;
  canApply?: boolean;
  onSave: (name: string, scope: PresetScope) => void | Promise<void>;
  onApply?: (preset: Preset) => void;
  onDelete?: (preset: Preset) => void | Promise<void>;
  onClose: () => void;
};

/** 中文注释：预设对话框只收集名称与调度资产动作；参数套用仍由页面层调用 EditorStore，确保进入撤销历史。 */
export function PresetDialog({
  open,
  templateName = "当前特效",
  initialName = "",
  presets = [],
  error,
  canSave = true,
  canApply = true,
  onSave,
  onApply,
  onDelete,
  onClose,
}: PresetDialogProps) {
  const [name, setName] = useState(initialName);
  const [scope, setScope] = useState<PresetScope>("full");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDeletePreset, setPendingDeletePreset] = useState<Preset | null>(null);
  const deleteConfirmationCancelRef = useRef<HTMLButtonElement>(null);

  /** 中文注释：确认框挂载完成后再聚焦取消操作，避免外层对话框的焦点守卫将焦点留在被遮罩的删除按钮上。 */
  const focusDeleteConfirmation = (event: Event) => {
    event.preventDefault();
    window.setTimeout(() => deleteConfirmationCancelRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (open) {
      setName(initialName);
      setScope("full");
      setIsSaving(false);
      setIsDeleting(false);
    }
  }, [initialName, open]);

  /** 中文注释：保存中锁定表单，避免同一组特效参数被重复写入工作区资产库。 */
  const save = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(name.trim(), scope);
    } finally {
      setIsSaving(false);
    }
  };

  /** 中文注释：删除确认由 AlertDialog 承担，取消操作不会影响当前对话框或个人预设列表。 */
  const deletePreset = async (preset: Preset) => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(preset);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
    <Dialog.Root modal={pendingDeletePreset === null} onOpenChange={(nextOpen) => { if (!nextOpen && !pendingDeletePreset) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="asset-dialog__overlay" />
        <Dialog.Content aria-describedby="preset-dialog-description" className="asset-dialog__content">
          <div aria-hidden="true" className="asset-dialog__signal">◎</div>
          <div className="asset-dialog__copy">
            <p className="asset-dialog__eyebrow">个人预设</p>
            <Dialog.Title>保存个人预设</Dialog.Title>
            <Dialog.Description id="preset-dialog-description">为“{templateName}”保存当前参数。套用预设只会更新当前特效片段，不会移动时间轴布局。</Dialog.Description>
          </div>
          <label className="asset-dialog__field">
            <span>预设名称</span>
            <input aria-describedby={error ? "preset-dialog-error" : undefined} autoFocus disabled={isSaving} onChange={(event) => setName(event.target.value)} placeholder="例如：知识点强调" value={name} />
          </label>
          <label className="asset-dialog__field">
            <span>预设范围</span>
            <select aria-label="预设范围" disabled={isSaving} onChange={(event) => setScope(event.target.value as PresetScope)} value={scope}>
              <option value="style">样式预设：保留当前内容</option>
              <option value="full">完整预设：恢复内容和表现</option>
            </select>
          </label>
          {error ? <p className="asset-dialog__error" id="preset-dialog-error" role="alert">{error}</p> : null}
          <div className="asset-dialog__actions">
            <Dialog.Close asChild><button className="asset-dialog__cancel" disabled={isSaving} type="button">取消</button></Dialog.Close>
            <button className="asset-dialog__confirm" disabled={!name.trim() || isSaving || !canSave} onClick={() => void save()} type="button">{isSaving ? "正在保存…" : "保存预设"}</button>
          </div>
          <section aria-label="我的个人预设" className="asset-dialog__library">
            <div className="asset-dialog__library-heading"><h3>我的个人预设</h3><span>{presets.length}</span></div>
            {presets.length === 0 ? <p className="asset-dialog__empty">还没有个人预设。保存后可快速套用到相同特效模板。</p> : (
              <ul className="asset-dialog__list">
                {presets.map((preset) => (
                  <li key={preset.id}>
                    <button aria-label={`套用“${preset.name}”`} className="asset-dialog__apply" disabled={!canApply} onClick={() => onApply?.(preset)} type="button">
                      <strong>套用“{preset.name}”</strong>
                      <span>{preset.scope === "style" ? "样式预设 · 保留当前内容" : "完整预设 · 恢复全部参数"}</span>
                    </button>
                    <button aria-label={`删除个人预设${preset.name}`} className="asset-dialog__delete" disabled={isDeleting} onClick={() => setPendingDeletePreset(preset)} type="button">删除</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <AlertDialog.Root onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDeletePreset(null); }} open={pendingDeletePreset !== null}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="asset-dialog__overlay asset-dialog__overlay--confirm" />
        <AlertDialog.Content className="asset-dialog__confirm-content" onOpenAutoFocus={focusDeleteConfirmation}>
          <p className="asset-dialog__danger-eyebrow">删除个人预设</p>
          <AlertDialog.Title>删除“{pendingDeletePreset?.name}”？</AlertDialog.Title>
          <AlertDialog.Description>此操作会从当前视频工作区的个人预设库中永久移除该配置，已套用到特效片段的参数不会改变。</AlertDialog.Description>
          <div className="asset-dialog__actions">
            <AlertDialog.Cancel asChild><button className="asset-dialog__cancel" disabled={isDeleting} ref={deleteConfirmationCancelRef} type="button">取消</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button className="asset-dialog__danger" disabled={isDeleting} onClick={() => { if (pendingDeletePreset) void deletePreset(pendingDeletePreset); }} type="button">{isDeleting ? "正在删除…" : "确认删除"}</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    </>
  );
}
