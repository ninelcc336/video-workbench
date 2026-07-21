import * as Select from "@radix-ui/react-select";
import { useState } from "react";

export type ProjectSummary = { id: string; name?: string; updatedAt?: string; sizeBytes?: number };
export type RecentWorkspace = { rootPath: string; name: string; lastOpenedAt: string };

export type ProjectManagerProps = {
  projectId: string;
  projects: ProjectSummary[];
  onOpen: (projectId: string) => void;
  onCreate: (projectId: string) => void;
  onRename: (projectId: string, nextProjectId: string) => void;
  onDelete: (projectId: string) => void;
};

/** 中文注释：项目管理器把项目选择与生命周期操作分开，避免把本地工作区误解成编辑项目。 */
export function ProjectManager({ projectId, projects, onOpen, onCreate, onRename, onDelete }: ProjectManagerProps) {
  const [managementOpen, setManagementOpen] = useState(false);
  const [name, setName] = useState("");

  /** 中文注释：新建与重命名共享输入框，服务端负责最终的名称安全和重复校验。 */
  const submit = (action: "create" | "rename") => {
    const nextProjectId = name.trim();
    if (!nextProjectId) return;
    if (action === "create") onCreate(nextProjectId);
    else onRename(projectId, nextProjectId);
    setName("");
  };

  return (
    <div className="project-manager">
      <Select.Root onValueChange={onOpen} value={projectId}>
        <Select.Trigger aria-label="选择编辑项目" className="project-select__trigger">
          <Select.Value placeholder="选择编辑项目" />
          <Select.Icon aria-hidden="true">⌄</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="project-select__content" position="popper">
            <Select.Viewport>
              {projects.map((project) => (
                <Select.Item className="project-select__item" key={project.id} value={project.id}>
                  <Select.ItemText>{project.name ?? project.id}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <button className="icon-button project-manager__button" onClick={() => setManagementOpen((open) => !open)} type="button">项目管理</button>
      {managementOpen ? (
        <section aria-label="项目管理" className="project-manager__panel">
          <label>
            项目名称
            <input aria-label="项目名称" onChange={(event) => setName(event.target.value)} placeholder="例如：知识视频" value={name} />
          </label>
          <div className="project-manager__actions">
            <button onClick={() => submit("create")} type="button">新建</button>
            <button disabled={!projectId} onClick={() => submit("rename")} type="button">重命名</button>
            <button disabled={!projectId} onClick={() => onDelete(projectId)} type="button">删除</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
