import { useState } from "react";
import type { RecentWorkspace } from "./ProjectManager";

export type WorkspaceSettingsProps = {
  currentWorkspaceName: string;
  recentWorkspaces: RecentWorkspace[];
  onOpenWorkspace: (rootPath: string) => void;
};

/** 中文注释：工作区设置把存储容器操作收进二级入口，编辑页顶栏只保留当前状态和项目入口。 */
export function WorkspaceSettings({ currentWorkspaceName, recentWorkspaces, onOpenWorkspace }: WorkspaceSettingsProps) {
  const [open, setOpen] = useState(false);
  const [rootPath, setRootPath] = useState("");

  /** 中文注释：提交路径同时支持打开既有目录和创建新目录，目录初始化由服务端保证幂等。 */
  const submitRootPath = () => {
    const nextPath = rootPath.trim();
    if (!nextPath) return;
    onOpenWorkspace(nextPath);
    setRootPath("");
    setOpen(false);
  };

  /** 中文注释：选择最近工作区后立即交给页面层确认未保存内容并执行切换。 */
  const selectRecentWorkspace = (nextRootPath: string) => {
    if (!nextRootPath) return;
    onOpenWorkspace(nextRootPath);
    setOpen(false);
  };

  if (!open) {
    return (
      <div aria-label="当前工作区" className="workspace-status">
        <span className="workspace-status__name" title={currentWorkspaceName}>工作区：{currentWorkspaceName}</span>
        <button className="icon-button" onClick={() => setOpen(true)} type="button">设置</button>
      </div>
    );
  }

  return (
    <div aria-label="工作区设置" className="workspace-settings">
      <div className="workspace-settings__heading">
        <strong>工作区设置</strong>
        <button aria-label="关闭工作区设置" className="icon-button" onClick={() => setOpen(false)} type="button">×</button>
      </div>
      <p>当前工作区：{currentWorkspaceName}</p>
      {recentWorkspaces.length > 0 ? (
        <label>
          最近使用
          <select aria-label="选择最近工作区" defaultValue="" onChange={(event) => selectRecentWorkspace(event.target.value)}>
            <option value="">选择工作区</option>
            {recentWorkspaces.map((workspace) => <option key={workspace.rootPath} value={workspace.rootPath}>{workspace.name}</option>)}
          </select>
        </label>
      ) : null}
      <label>
        打开或创建本地工作区
        <input aria-label="工作区路径" onChange={(event) => setRootPath(event.target.value)} placeholder="例如：D:\\视频工作区" value={rootPath} />
      </label>
      <button onClick={submitRootPath} type="button">打开工作区</button>
    </div>
  );
}
