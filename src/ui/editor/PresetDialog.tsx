import { useEffect, useState } from "react";
import type { Preset } from "../../domain/assets/preset-model";

export type PresetDialogProps = {
  open: boolean;
  templateName?: string;
  initialName?: string;
  presets?: Preset[];
  error?: string;
  onSave: (name: string) => void;
  onApply?: (preset: Preset) => void;
  onClose: () => void;
};

/** 中文注释：预设对话框只负责收集名称和展示资产，实际应用由上层通过 EditorStore 完成。 */
export function PresetDialog({
  open,
  templateName = "当前特效",
  initialName = "",
  presets = [],
  error,
  onSave,
  onApply,
  onClose,
}: PresetDialogProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [initialName, open]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="preset-dialog-title">
      <h2 id="preset-dialog-title">保存个人预设</h2>
      <p>为“{templateName}”保存一组常用参数。</p>
      <label>
        预设名称
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <div>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" disabled={!name.trim()} onClick={() => onSave(name.trim())}>保存预设</button>
      </div>
      {presets.length > 0 ? (
        <section aria-label="我的个人预设">
          <h3>我的个人预设</h3>
          {presets.map((preset) => (
            <button type="button" key={preset.id} onClick={() => onApply?.(preset)}>
              {preset.name}
            </button>
          ))}
        </section>
      ) : null}
    </div>
  );
}
