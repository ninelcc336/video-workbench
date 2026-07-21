import * as AlertDialog from "@radix-ui/react-alert-dialog";

export type NavigationConfirmDialogProps = {
  open: boolean;
  destination: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** 中文注释：项目和本地工作区共用同一个受控确认对话框，取消时不改变当前导航状态。 */
export function NavigationConfirmDialog({ open, destination, onCancel, onConfirm }: NavigationConfirmDialogProps) {
  return (
    <AlertDialog.Root onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }} open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="reset-dialog__overlay" />
        <AlertDialog.Content className="reset-dialog__content">
          <div aria-hidden="true" className="reset-dialog__signal">!</div>
          <div className="reset-dialog__copy">
            <p className="reset-dialog__eyebrow">未保存的编辑</p>
            <AlertDialog.Title>继续切换到“{destination}”？</AlertDialog.Title>
            <AlertDialog.Description>自动保存正在进行或曾经失败。继续切换可能丢失尚未保存的编辑。</AlertDialog.Description>
          </div>
          <div className="reset-dialog__actions">
            <AlertDialog.Cancel asChild><button className="reset-dialog__cancel" onClick={onCancel} type="button">返回编辑</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button className="reset-dialog__confirm" onClick={onConfirm} type="button">继续切换</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
