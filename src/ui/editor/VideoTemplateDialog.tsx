import { useEffect, useState } from "react";
import type { VideoTemplate } from "../../domain/assets/video-template-model";

export type VideoTemplateDialogProps = {
  open: boolean;
  effectCount: number;
  initialName?: string;
  template?: VideoTemplate;
  templates?: VideoTemplate[];
  error?: string;
  onSave: (name: string) => void;
  onApply?: (template: VideoTemplate) => void;
  onDelete?: (template: VideoTemplate) => void;
  onClose: () => void;
};

/** 中文注释：视频模板对话框强调新增片段数量，避免用户误以为会替换原视频。 */
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

  useEffect(() => {
    if (open) setName(initialName);
  }, [initialName, open]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="video-template-dialog-title">
      <h2 id="video-template-dialog-title">保存视频模板</h2>
      <p>模板只保存特效片段的相对布局，不会保存视频素材。</p>
      <label>
        模板名称
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <p>当前将保存 {effectCount} 个特效片段。</p>
      {templates.map((item) => <div key={item.id}><button type="button" onClick={() => onApply?.(item)}>套用“{item.name}”（将新增 {item.effectClips.length} 个特效片段）</button><button aria-label={`删除${item.name}`} onClick={() => onDelete?.(item)} type="button">删除</button></div>)}
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" disabled={!name.trim()} onClick={() => onSave(name.trim())}>保存模板</button>
      </div>
    </div>
  );
}
