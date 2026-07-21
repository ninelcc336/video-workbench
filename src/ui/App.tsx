import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEditorStore } from "../domain/editor/editor-store";
import { createEmptyProject } from "../domain/project/factories";
import type { EditProject } from "../domain/project/model";
import type { AutosaveStatus } from "./editor/SaveIndicator";
import { EditorPage } from "./editor/EditorPage";
import { NavigationConfirmDialog } from "./editor/NavigationConfirmDialog";
import type { ProjectSummary, RecentWorkspace } from "./editor/ProjectManager";
import "./editor/editor.css";

type ProjectResponse = { project: EditProject; missingMediaIds?: string[]; mediaSources?: Record<string, string> };
type AppPhase = "loading" | "launcher" | "empty" | "editor" | "error";
type PendingNavigation = { destination: string; execute: () => void } | null;

/** 中文注释：保存项目只通过稳定项目 ID 写入当前本地工作区，避免前端触碰文件路径。 */
async function saveLocalProject(project: EditProject, projectId: string): Promise<void> {
  const response = await fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}`, { body: JSON.stringify(project), headers: { "Content-Type": "application/json" }, method: "PUT" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "本地项目保存失败");
  }
}

/** 中文注释：启动页和空工作区共用创建或打开入口，用户必须明确选择本地工作区或编辑项目。 */
function WorkspaceStart({ currentWorkspaceName, error, onCreateProject, onOpenWorkspace, onRecoverProject, recentWorkspaces, showProjectCreate }: {
  currentWorkspaceName?: string;
  error: string | null;
  onCreateProject: (name: string) => void;
  onOpenWorkspace: (path: string) => void;
  onRecoverProject?: () => void;
  recentWorkspaces: RecentWorkspace[];
  showProjectCreate: boolean;
}) {
  const [projectName, setProjectName] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  return (
    <main className="workspace-start">
      <section className="workspace-start__card" role="region" aria-label={showProjectCreate ? "空工作区" : "启动页"}>
        <p className="workspace-start__eyebrow">FRAME / FLOW · 本地优先</p>
        <h1>{showProjectCreate ? "此工作区暂无编辑项目" : "选择你的本地工作区"}</h1>
        <p>{showProjectCreate ? `“${currentWorkspaceName ?? "当前工作区"}”已准备好。创建第一个编辑项目后即可开始。` : "视频素材、编辑项目、个人预设和视频模板都会保存在你选择的本地目录中。"}</p>
        {error ? <p className="workspace-start__error" role="alert">{error}</p> : null}
        {error && onRecoverProject ? <button onClick={onRecoverProject} type="button">从最近备份恢复</button> : null}
        {showProjectCreate ? <label>编辑项目名称<input aria-label="新建编辑项目名称" onChange={(event) => setProjectName(event.target.value)} placeholder="例如：知识视频" value={projectName} /></label> : null}
        {showProjectCreate ? <button className="workspace-start__primary" onClick={() => onCreateProject(projectName)} type="button">新建编辑项目</button> : null}
        <label>打开或创建本地工作区<input aria-label="启动工作区路径" onChange={(event) => setWorkspacePath(event.target.value)} placeholder="例如：D:\\视频工作区" value={workspacePath} /></label>
        <button onClick={() => onOpenWorkspace(workspacePath)} type="button">打开工作区</button>
        {recentWorkspaces.length > 0 ? <div className="workspace-start__recent"><strong>最近使用</strong>{recentWorkspaces.map((workspace) => <button key={workspace.rootPath} onClick={() => onOpenWorkspace(workspace.rootPath)} type="button"><span>{workspace.name}</span><small>{workspace.rootPath}</small></button>)}</div> : null}
      </section>
    </main>
  );
}

/** 中文注释：App 只协调启动、空工作区、导航确认和项目加载；实际编辑仍交给 EditorPage。 */
export function App() {
  const [phase, setPhase] = useState<AppPhase>("loading");
  const [project, setProject] = useState<EditProject | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [workspaceRootPath, setWorkspaceRootPath] = useState<string | null>(null);
  const [missingMediaIds, setMissingMediaIds] = useState<string[]>([]);
  const [mediaSources, setMediaSources] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [retryWorkspaceRootPath, setRetryWorkspaceRootPath] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const activeProjectRef = useRef<EditProject | null>(null);

  useEffect(() => {
    // 中文注释：异步项目读取失败时通过 ref 判断是否已有编辑器，避免闭包把当前项目误判为空。
    activeProjectRef.current = project;
  }, [project]);

  /** 中文注释：读取项目成功后一次性替换编辑快照及其媒体地址，失败时保留原编辑页。 */
  const loadProject = useCallback(async (nextProjectId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/workspace/projects/${encodeURIComponent(nextProjectId)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        setBackupAvailable(Boolean((body as { backupAvailable?: boolean } | null)?.backupAvailable));
        throw new Error(body?.message ?? "无法读取编辑项目");
      }
      const value = await response.json() as ProjectResponse;
      setProject(value.project);
      setProjectId(nextProjectId);
      setMediaSources(value.mediaSources ?? {});
      setMissingMediaIds(value.missingMediaIds ?? []);
      setLoadError(null);
      setBackupAvailable(false);
      setPhase("editor");
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取编辑项目");
      if (!activeProjectRef.current) setPhase("error");
      return false;
    }
  }, []);

  /** 中文注释：项目列表为空即进入合法空工作区状态；否则按仓储给出的最近更新时间顺序打开首项。 */
  const refreshProjects = useCallback(async (preferredProjectId?: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/workspace/projects");
      if (!response.ok) throw new Error("无法读取编辑项目列表");
      const loaded = await response.json() as ProjectSummary[];
      setProjects(loaded);
      if (loaded.length === 0) {
        setProject(null);
        setProjectId(null);
        setPhase("empty");
        return true;
      }
      return await loadProject(loaded.find((item) => item.id === preferredProjectId)?.id ?? loaded[0].id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取编辑项目列表");
      return false;
    }
  }, [loadProject]);

  useEffect(() => {
    // 中文注释：首次启动没有最近工作区时停在启动页，不创建隐含默认工作区或编辑项目。
    void fetch("/api/workspace/recent").then(async (response) => response.ok ? await response.json() as RecentWorkspace[] : []).then(async (loaded) => {
      setRecentWorkspaces(loaded);
      if (!loaded[0]) { setPhase("launcher"); return; }
      setWorkspaceRootPath(loaded[0].rootPath);
      await refreshProjects();
    }).catch(() => setPhase("launcher"));
  }, [refreshProjects]);

  /** 中文注释：只有自动保存进行中或失败时才要求确认，已保存状态可直接导航。 */
  const requestNavigation = (destination: string, execute: () => void) => {
    if (autosaveStatus === "saving" || autosaveStatus === "error") setPendingNavigation({ destination, execute });
    else execute();
  };

  /** 中文注释：工作区候选目录由服务端原子校验；失败后保持当前编辑项目和工作区错误入口。 */
  const openWorkspaceActual = async (normalizedPath: string): Promise<boolean> => {
    setWorkspaceError(null);
    setRetryWorkspaceRootPath(normalizedPath);
    try {
      const response = await fetch("/api/workspace/open", { body: JSON.stringify({ rootPath: normalizedPath }), headers: { "Content-Type": "application/json" }, method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "工作区打开失败");
      }
      const value = await response.json() as { rootPath: string; recentWorkspaces: RecentWorkspace[] };
      setWorkspaceRootPath(value.rootPath);
      setRecentWorkspaces(value.recentWorkspaces);
      if (!await refreshProjects()) throw new Error("工作区项目无法读取");
      return true;
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "工作区打开失败");
      return false;
    }
  };

  const openWorkspace = (rootPath: string): Promise<boolean> => {
    const normalizedPath = rootPath.trim();
    if (!normalizedPath) return Promise.resolve(false);
    if (autosaveStatus === "saving" || autosaveStatus === "error") {
      setPendingNavigation({ destination: normalizedPath, execute: () => { void openWorkspaceActual(normalizedPath); } });
      return Promise.resolve(false);
    }
    return openWorkspaceActual(normalizedPath);
  };

  /** 中文注释：新建项目必须由用户明确命名，项目仓储负责名称安全和大小写冲突校验。 */
  const createProject = (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) { setLoadError("请输入编辑项目名称"); return; }
    void fetch(`/api/workspace/projects/${encodeURIComponent(normalizedName)}`, { body: JSON.stringify(createEmptyProject()), headers: { "Content-Type": "application/json" }, method: "POST" })
      .then(async (response) => { if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "创建编辑项目失败"); return refreshProjects(normalizedName); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "创建编辑项目失败"));
  };

  const renameProject = (currentId: string, nextProjectId: string) => {
    void fetch(`/api/workspace/projects/${encodeURIComponent(currentId)}`, { body: JSON.stringify({ name: nextProjectId }), headers: { "Content-Type": "application/json" }, method: "PATCH" })
      .then(async (response) => { if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "重命名编辑项目失败"); return refreshProjects(nextProjectId.trim()); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "重命名编辑项目失败"));
  };

  const deleteProject = (currentId: string) => {
    void fetch(`/api/workspace/projects/${encodeURIComponent(currentId)}`, { method: "DELETE" })
      .then(async (response) => { if (!response.ok) throw new Error("删除编辑项目失败"); return refreshProjects(); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "删除编辑项目失败"));
  };

  const openProject = (nextProjectId: string) => {
    if (nextProjectId === projectId) return;
    requestNavigation(nextProjectId, () => { void loadProject(nextProjectId); });
  };

  const recoverProject = () => {
    if (!projectId) return;
    void fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}?recover=backup`).then(async (response) => {
      if (!response.ok) throw new Error("备份恢复失败");
      await loadProject(projectId);
    }).catch((error) => setLoadError(error instanceof Error ? error.message : "备份恢复失败"));
  };

  const currentWorkspaceName = recentWorkspaces.find((workspace) => workspace.rootPath === workspaceRootPath)?.name ?? "本地工作区";
  const store = useMemo(() => project ? createEditorStore(project) : null, [project]);

  if (phase === "loading") return <main className="workspace-start"><p>正在读取本地工作区…</p></main>;
  if (phase === "launcher" || phase === "error") return <WorkspaceStart error={loadError} onCreateProject={createProject} onOpenWorkspace={openWorkspace} onRecoverProject={backupAvailable ? recoverProject : undefined} recentWorkspaces={recentWorkspaces} showProjectCreate={false} />;
  if (phase === "empty" || !project || !store || !projectId) return <WorkspaceStart currentWorkspaceName={currentWorkspaceName} error={loadError} onCreateProject={createProject} onOpenWorkspace={openWorkspace} recentWorkspaces={recentWorkspaces} showProjectCreate />;

  return <><EditorPage backupAvailable={backupAvailable} currentWorkspaceName={currentWorkspaceName} mediaSources={mediaSources} missingMediaIds={missingMediaIds} onAutosaveStatusChange={setAutosaveStatus} onCreateProject={createProject} onDeleteProject={deleteProject} onDismissWorkspaceError={() => { setWorkspaceError(null); setLoadError(null); }} onOpenProject={openProject} onOpenWorkspace={openWorkspace} onRecoverProject={recoverProject} onRenameProject={renameProject} onRetryWorkspace={() => retryWorkspaceRootPath && openWorkspace(retryWorkspaceRootPath)} onSaveProject={(snapshot) => saveLocalProject(snapshot, projectId)} projectId={projectId} projects={projects} recentWorkspaces={recentWorkspaces} store={store} workspaceError={workspaceError ?? loadError} /><NavigationConfirmDialog destination={pendingNavigation?.destination ?? ""} onCancel={() => setPendingNavigation(null)} onConfirm={() => { const action = pendingNavigation?.execute; setPendingNavigation(null); action?.(); }} open={pendingNavigation !== null} /></>;
}
