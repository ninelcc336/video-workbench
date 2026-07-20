import { useState } from "react";

export type ProjectSummary = { id: string; name?: string; updatedAt?: string; sizeBytes?: number };
export type RecentWorkspace = { rootPath: string; name: string; lastOpenedAt: string };

export type ProjectManagerProps = {
  projectId: string;
  projects: ProjectSummary[];
  onOpen: (projectId: string) => void;
  onCreate: (projectId: string) => void;
  onRename: (projectId: string, nextProjectId: string) => void;
  onCopy: (projectId: string, nextProjectId: string) => void;
  onDelete: (projectId: string) => void;
  recentWorkspaces?: RecentWorkspace[];
  onOpenWorkspace?: (rootPath: string) => void;
};

/** 中文注释：项目管理器只发出生命周期意图，实际文件操作由 App 通过工作区 HTTP 接口完成。 */
export function ProjectManager({ projectId, projects, onOpen, onCreate, onRename, onCopy, onDelete, recentWorkspaces = [], onOpenWorkspace }: ProjectManagerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) return <button className="icon-button" onClick={() => setOpen(true)} type="button">项目</button>;

  /** 中文注释：新建只提交用户输入的项目标识，避免组件直接触碰工作区文件。 */
  const submitCreate = () => {
    const next = name.trim();
    if (next) { onCreate(next); setName(""); }
  };
  /** 中文注释：重命名沿用父级当前项目 ID，服务端负责路径安全和冲突校验。 */
  const submitRename = () => {
    const next = name.trim();
    if (next) { onRename(projectId, next); setName(""); }
  };
  /** 中文注释：复制操作只发出目标名称，项目快照复制由工作区仓储完成。 */
  const submitCopy = () => {
    const next = name.trim();
    if (next) { onCopy(projectId, next); setName(""); }
  };

  return (
    <div aria-label="项目管理" className="project-manager">
      <select aria-label="选择编辑项目" value={projectId} onChange={(event) => onOpen(event.target.value)}>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name ?? project.id}</option>)}
      </select>
      <input aria-label="项目名称" onChange={(event) => setName(event.target.value)} placeholder="项目名称" value={name} />
      <button onClick={submitCreate} type="button">新建</button>
      <button onClick={submitRename} type="button">重命名</button>
      <button onClick={submitCopy} type="button">复制</button>
      <button disabled={projectId === "local-project"} onClick={() => onDelete(projectId)} type="button">删除</button>
      {recentWorkspaces.length > 0 ? <select aria-label="选择最近工作区" defaultValue="" onChange={(event) => { if (event.target.value) onOpenWorkspace?.(event.target.value); }}><option value="">最近工作区</option>{recentWorkspaces.map((workspace) => <option key={workspace.rootPath} value={workspace.rootPath}>{workspace.name}</option>)}</select> : null}
      <button aria-label="关闭项目管理" onClick={() => setOpen(false)} type="button">×</button>
    </div>
  );
}
