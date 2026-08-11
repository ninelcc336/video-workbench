import * as Dialog from "@radix-ui/react-dialog";
import type {
  EffectFamilyIssue,
  EffectFamilyParameterChange,
} from "../../domain/templates/effect-family";

export type EffectChangePreviewDialogProps = {
  open: boolean;
  title: string;
  description: string;
  changes: ReadonlyArray<EffectFamilyParameterChange>;
  droppedKeys?: ReadonlyArray<string>;
  defaultedKeys?: ReadonlyArray<string>;
  warnings?: ReadonlyArray<EffectFamilyIssue>;
  errors?: ReadonlyArray<EffectFamilyIssue>;
  aspectRatioLayoutOption?: {
    checked: boolean;
    label: string;
    onChange: (checked: boolean) => void;
  };
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "不可展示的参数";
  }
}

/** 中文注释：变更预览只展示领域模块返回的差异，不重新计算参数，确保确认内容与实际命令一致。 */
export function EffectChangePreviewDialog({
  open,
  title,
  description,
  changes,
  droppedKeys = [],
  defaultedKeys = [],
  warnings = [],
  errors = [],
  aspectRatioLayoutOption,
  confirmLabel,
  onConfirm,
  onClose,
}: EffectChangePreviewDialogProps) {
  return (
    <Dialog.Root onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="asset-dialog__overlay" />
        <Dialog.Content aria-describedby="effect-change-dialog-description" className="asset-dialog__content effect-change-dialog">
          <div aria-hidden="true" className="asset-dialog__signal">↗</div>
          <div className="asset-dialog__copy">
            <p className="asset-dialog__eyebrow">需确认的编辑操作</p>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description id="effect-change-dialog-description">{description}</Dialog.Description>
          </div>
          {errors.length > 0 ? (
            <section aria-label="变更阻断错误" className="effect-change-dialog__section effect-change-dialog__section--error" role="alert">
              <h3>无法提交</h3>
              {errors.map((issue, index) => <p key={`${issue.code}-${issue.key ?? "error"}-${index}`}>{issue.message}</p>)}
            </section>
          ) : null}
          <section aria-label="参数变更" className="effect-change-dialog__section">
            <h3>参数变更 <span>{changes.length}</span></h3>
            {changes.length === 0 ? <p>没有可见的参数变化。</p> : (
              <ul>
                {changes.map((change) => <li key={change.key}><strong>{change.key}</strong><span>{formatValue(change.previousValue)} → {formatValue(change.nextValue)}</span></li>)}
              </ul>
            )}
          </section>
          {defaultedKeys.length > 0 ? (
            <section aria-label="迁移默认项" className="effect-change-dialog__section">
              <h3>使用默认值 <span>{defaultedKeys.length}</span></h3>
              <p>{defaultedKeys.join("、")}</p>
            </section>
          ) : null}
          {droppedKeys.length > 0 ? (
            <section aria-label="迁移丢弃项" className="effect-change-dialog__section effect-change-dialog__section--warning">
              <h3>将丢弃的旧参数 <span>{droppedKeys.length}</span></h3>
              <p>{droppedKeys.join("、")}</p>
            </section>
          ) : null}
          {warnings.length > 0 ? (
            <section aria-label="变更警告" className="effect-change-dialog__section effect-change-dialog__section--warning" role="status">
              <h3>需要留意</h3>
              {warnings.map((issue, index) => <p key={`${issue.code}-${issue.key ?? "warning"}-${index}`}>{issue.message}</p>)}
            </section>
          ) : null}
          {aspectRatioLayoutOption ? (
            <label className="effect-change-dialog__layout-choice">
              <input
                checked={aspectRatioLayoutOption.checked}
                onChange={(event) => aspectRatioLayoutOption.onChange(event.target.checked)}
                type="checkbox"
              />
              <span>{aspectRatioLayoutOption.label}</span>
            </label>
          ) : null}
          <div className="asset-dialog__actions">
            <Dialog.Close asChild><button className="asset-dialog__cancel" type="button">取消</button></Dialog.Close>
            <button className="asset-dialog__confirm" disabled={errors.length > 0} onClick={onConfirm} type="button">{confirmLabel}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
