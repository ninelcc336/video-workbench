import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { VideoTemplate } from "../../domain/assets/video-template-model";

export type VideoTemplateDialogProps = {
  open: boolean;
  effectCount: number;
  initialName?: string;
  /** 中文注释：保留单模板属性以兼容既有调用方；新页面使用 templates 加载完整资产库。 */
  template?: VideoTemplate;
  templates?: VideoTemplate[];
  error?: string;
  onSave: (name: string) => void | Promise<void>;
  onApply?: (template: VideoTemplate) => void;
  onDelete?: (template: VideoTemplate) => void | Promise<void>;
  onClose: () => void;
};

/** 中文注释：视频模板对话框明确模板只新增特效片段，防止用户误以为会替换当前视频素材或时间轴。 */
export function VideoTemplateDialog({
  open,
  effectCount,
  initialName = "",
  template,
  templates = template ? [template] : [],
  error,
  onSave,
  onApply,
  onDelete,
  onClose,
}: VideoTemplateDialogProps) {
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<VideoTemplate | null>(null);
  const deleteConfirmationCancelRef = useRef<HTMLButtonElement>(null);

  /** 中文注释：确认框挂载完成后再聚焦取消操作，避免外层对话框的焦点守卫将焦点留在被遮罩的删除按钮上。 */
  const focusDeleteConfirmation = (event: Event) => {
    event.preventDefault();
    window.setTimeout(() => deleteConfirmationCancelRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (open) {
      setName(initialName);
      setIsSaving(false);
      setIsDeleting(false);
    }
  }, [initialName, open]);

  /** 中文注释：保存动作等待服务端返回，避免模板列表在网络未完成时展示不存在的本地项。 */
  const save = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setIsSaving(false);
    }
  };

  /** 中文注释：确认删除仅移除模板资产，不会反向删除已经添加到当前工作区时间轴的特效片段。 */
  const deleteTemplate = async (template: VideoTemplate) => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(template);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
    <Dialog.Root modal={pendingDeleteTemplate === null} onOpenChange={(nextOpen) => { if (!nextOpen && !pendingDeleteTemplate) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="asset-dialog__overlay" />
        <Dialog.Content aria-describedby="video-template-dialog-description" className="asset-dialog__content">
          <div aria-hidden="true" className="asset-dialog__signal">▤</div>
          <div className="asset-dialog__copy">
            <p className="asset-dialog__eyebrow">视频模板</p>
            <Dialog.Title>保存视频模板</Dialog.Title>
            <Dialog.Description id="video-template-dialog-description">模板只保存特效片段的相对布局，不会保存视频素材。当前将保存 {effectCount} 个特效片段。</Dialog.Description>
          </div>
          <label className="asset-dialog__field">
            <span>模板名称</span>
            <input aria-describedby={error ? "video-template-dialog-error" : undefined} autoFocus disabled={isSaving} onChange={(event) => setName(event.target.value)} placeholder="例如：片头知识卡" value={name} />
          </label>
          {error ? <p className="asset-dialog__error" id="video-template-dialog-error" role="alert">{error}</p> : null}
          <div className="asset-dialog__actions">
            <Dialog.Close asChild><button className="asset-dialog__cancel" disabled={isSaving} type="button">取消</button></Dialog.Close>
            <button className="asset-dialog__confirm" disabled={!name.trim() || isSaving} onClick={() => void save()} type="button">{isSaving ? "正在保存…" : "保存模板"}</button>
          </div>
          <section aria-label="我的视频模板" className="asset-dialog__library">
            <div className="asset-dialog__library-heading"><h3>我的视频模板</h3><span>{templates.length}</span></div>
            {templates.length === 0 ? <p className="asset-dialog__empty">还没有视频模板。保存当前特效布局后，可在播放头位置新增整套布局。</p> : (
              <ul className="asset-dialog__list">
                {templates.map((template) => (
                  <li key={template.id}>
                    <button className="asset-dialog__apply" onClick={() => onApply?.(template)} type="button">套用“{template.name}” <span>新增 {template.effectClips.length} 个特效片段</span></button>
                    <button aria-label={`删除视频模板${template.name}`} className="asset-dialog__delete" disabled={isDeleting} onClick={() => setPendingDeleteTemplate(template)} type="button">删除</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <AlertDialog.Root onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDeleteTemplate(null); }} open={pendingDeleteTemplate !== null}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="asset-dialog__overlay asset-dialog__overlay--confirm" />
        <AlertDialog.Content className="asset-dialog__confirm-content" onOpenAutoFocus={focusDeleteConfirmation}>
          <p className="asset-dialog__danger-eyebrow">删除视频模板</p>
          <AlertDialog.Title>删除“{pendingDeleteTemplate?.name}”？</AlertDialog.Title>
          <AlertDialog.Description>此操作会从当前视频工作区的模板库中永久移除该布局，已经套用到时间轴的特效片段不会改变。</AlertDialog.Description>
          <div className="asset-dialog__actions">
            <AlertDialog.Cancel asChild><button className="asset-dialog__cancel" disabled={isDeleting} ref={deleteConfirmationCancelRef} type="button">取消</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button className="asset-dialog__danger" disabled={isDeleting} onClick={() => { if (pendingDeleteTemplate) void deleteTemplate(pendingDeleteTemplate); }} type="button">{isDeleting ? "正在删除…" : "确认删除"}</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    </>
  );
}
