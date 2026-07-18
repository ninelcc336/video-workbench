import * as AlertDialog from "@radix-ui/react-alert-dialog";

export type ResetProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/** 中文注释：使用 Radix 的无障碍警告对话框承载破坏性重置确认，替代阻塞式浏览器原生弹窗。 */
export function ResetProjectDialog({ open, onOpenChange, onConfirm }: ResetProjectDialogProps) {
  return (
    <AlertDialog.Root onOpenChange={onOpenChange} open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="reset-dialog__overlay" />
        <AlertDialog.Content className="reset-dialog__content">
          <div aria-hidden="true" className="reset-dialog__signal">↺</div>
          <div className="reset-dialog__copy">
            <p className="reset-dialog__eyebrow">需确认的编辑操作</p>
            <AlertDialog.Title>重置此编辑项目？</AlertDialog.Title>
            <AlertDialog.Description>
              时间轴片段、画布和导出规格将恢复初始状态。本地导入的视频文件会保留，且重置后仍可撤销。
            </AlertDialog.Description>
          </div>
          <div className="reset-dialog__actions">
            <AlertDialog.Cancel asChild>
              <button className="reset-dialog__cancel" type="button">取消</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="reset-dialog__confirm" onClick={onConfirm} type="button">确认重置</button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
