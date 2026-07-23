import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import { useState } from "react";

export type WorkspaceSummary = { id: string; name?: string; updatedAt?: string; sizeBytes?: number };

export type ProjectManagerProps = {
  workspaceId: string;
  workspaces: WorkspaceSummary[];
  onOpen: (workspaceId: string) => void;
  onCreate: (workspaceId: string) => void | Promise<void>;
  onRename: (workspaceId: string, nextWorkspaceId: string) => void | Promise<void>;
  onDelete: (workspaceId: string) => void | Promise<void>;
};

/** 中文注释：将未知操作异常转换为可在工作区管理对话框中展示的稳定文案。 */
function getOperationError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 中文注释：工作区管理器只管理视频创作边界，底层目录位置始终不向用户显示。 */
export function ProjectManager({ workspaceId, workspaces, onOpen, onCreate, onRename, onDelete }: ProjectManagerProps) {
  const [managementOpen, setManagementOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState("");
  const [operationError, setOperationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentWorkspaceName = workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? workspaceId;

  /** 中文注释：新建和重命名在提交前统一校验名称，并让服务端继续负责安全性和唯一性校验。 */
  const submit = async (action: "create" | "rename") => {
    const nextWorkspaceId = name.trim();
    if (!nextWorkspaceId) {
      setOperationError("请输入视频工作区名称");
      return;
    }
    setIsSubmitting(true);
    setOperationError(null);
    try {
      if (action === "create") await onCreate(nextWorkspaceId);
      else await onRename(workspaceId, nextWorkspaceId);
      setName("");
      setManagementOpen(false);
    } catch (error) {
      setOperationError(getOperationError(error, action === "create" ? "创建视频工作区失败" : "重命名视频工作区失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 中文注释：删除确认只在用户明确确认后调用上层接口，取消时保持当前工作区和编辑状态不变。 */
  const confirmDelete = async () => {
    setIsSubmitting(true);
    setOperationError(null);
    try {
      await onDelete(workspaceId);
      setDeleteOpen(false);
      setManagementOpen(false);
    } catch (error) {
      setOperationError(getOperationError(error, "删除视频工作区失败"));
      setDeleteOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** 中文注释：关闭管理窗口时清理临时表单和错误，避免下次打开遗留上一轮操作结果。 */
  const setManagementDialogOpen = (nextOpen: boolean) => {
    setManagementOpen(nextOpen);
    if (!nextOpen) {
      setName("");
      setOperationError(null);
    }
  };

  return (
    <div className="project-manager">
      <Select.Root onValueChange={onOpen} value={workspaceId}>
        <Select.Trigger aria-label="选择视频工作区" className="project-select__trigger">
          <Select.Value className="project-select__value" placeholder="选择视频工作区" />
          <Select.Icon asChild>
            <svg aria-hidden="true" className="project-select__icon" fill="none" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="project-select__content" position="popper">
            <Select.Viewport>
              {workspaces.map((workspace) => (
                <Select.Item className="project-select__item" key={workspace.id} value={workspace.id}>
                  <Select.ItemText>{workspace.name ?? workspace.id}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <Dialog.Root onOpenChange={setManagementDialogOpen} open={managementOpen}>
        <Dialog.Trigger asChild><button className="icon-button project-manager__button" type="button">工作区管理</button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="reset-dialog__overlay" />
          <Dialog.Content aria-describedby="workspace-management-description" className="workspace-dialog__content">
            <div className="workspace-dialog__heading">
              <div>
                <p className="reset-dialog__eyebrow">本地工作区库</p>
                <Dialog.Title>管理视频工作区</Dialog.Title>
              </div>
              <Dialog.Close aria-label="关闭工作区管理" className="workspace-dialog__close" type="button">×</Dialog.Close>
            </div>
            <Dialog.Description id="workspace-management-description">创建、重命名或删除视频工作区。每个工作区的时间轴和素材彼此隔离。</Dialog.Description>
            <label className="workspace-dialog__field">工作区名称
              <input aria-label="工作区名称" disabled={isSubmitting} onChange={(event) => setName(event.target.value)} placeholder={currentWorkspaceName} value={name} />
            </label>
            {operationError ? <p className="workspace-dialog__error" role="alert">{operationError}</p> : null}
            <div className="workspace-dialog__actions">
              <button className="reset-dialog__cancel" disabled={isSubmitting} onClick={() => void submit("create")} type="button">新建</button>
              <button className="reset-dialog__confirm" disabled={isSubmitting || !workspaceId} onClick={() => void submit("rename")} type="button">{isSubmitting ? "正在保存…" : "重命名"}</button>
              <button className="workspace-dialog__danger" disabled={isSubmitting || !workspaceId} onClick={() => setDeleteOpen(true)} type="button">删除</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="reset-dialog__overlay" />
          <AlertDialog.Content className="reset-dialog__content">
            <div aria-hidden="true" className="reset-dialog__signal">!</div>
            <div className="reset-dialog__copy">
              <p className="reset-dialog__eyebrow">危险操作</p>
              <AlertDialog.Title>删除“{currentWorkspaceName}”？</AlertDialog.Title>
              <AlertDialog.Description>将永久移除该视频工作区及其私有素材和导出结果，其他工作区不会受到影响。</AlertDialog.Description>
            </div>
            <div className="reset-dialog__actions">
              <AlertDialog.Cancel asChild><button className="reset-dialog__cancel" disabled={isSubmitting} type="button">取消</button></AlertDialog.Cancel>
              <button className="workspace-dialog__danger" disabled={isSubmitting} onClick={() => void confirmDelete()} type="button">{isSubmitting ? "正在删除…" : "确认删除"}</button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
