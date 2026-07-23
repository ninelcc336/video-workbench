import * as Select from "@radix-ui/react-select";
import { useState } from "react";

export type WorkspaceSummary = { id: string; name?: string; updatedAt?: string; sizeBytes?: number };

export type ProjectManagerProps = {
  workspaceId: string;
  workspaces: WorkspaceSummary[];
  onOpen: (workspaceId: string) => void;
  onCreate: (workspaceId: string) => void;
  onRename: (workspaceId: string, nextWorkspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
};

/** 中文注释：工作区管理器只管理视频创作边界，底层目录位置始终不向用户显示。 */
export function ProjectManager({ workspaceId, workspaces, onOpen, onCreate, onRename, onDelete }: ProjectManagerProps) {
  const [managementOpen, setManagementOpen] = useState(false);
  const [name, setName] = useState("");

  /** 中文注释：新建与重命名共享输入框，服务端负责最终的名称安全和重复校验。 */
  const submit = (action: "create" | "rename") => {
    const nextWorkspaceId = name.trim();
    if (!nextWorkspaceId) return;
    if (action === "create") onCreate(nextWorkspaceId);
    else onRename(workspaceId, nextWorkspaceId);
    setName("");
  };

  return (
    <div className="project-manager">
      <Select.Root onValueChange={onOpen} value={workspaceId}>
        <Select.Trigger aria-label="选择视频工作区" className="project-select__trigger">
          <Select.Value placeholder="选择视频工作区" />
          <Select.Icon aria-hidden="true">⌄</Select.Icon>
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
      <button className="icon-button project-manager__button" onClick={() => setManagementOpen((open) => !open)} type="button">工作区管理</button>
      {managementOpen ? (
        <section aria-label="工作区管理" className="project-manager__panel">
          <label>
            工作区名称
            <input aria-label="工作区名称" onChange={(event) => setName(event.target.value)} placeholder="例如：知识视频" value={name} />
          </label>
          <div className="project-manager__actions">
            <button onClick={() => submit("create")} type="button">新建</button>
            <button disabled={!workspaceId} onClick={() => submit("rename")} type="button">重命名</button>
            <button disabled={!workspaceId} onClick={() => onDelete(workspaceId)} type="button">删除</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
