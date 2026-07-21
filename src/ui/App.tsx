import { useCallback, useEffect, useMemo, useState } from "react";
import { createEditorStore } from "../domain/editor/editor-store";
import { createEmptyProject } from "../domain/project/factories";
import type { EditProject } from "../domain/project/model";
import { EditorPage } from "./editor/EditorPage";
import type { ProjectSummary, RecentWorkspace } from "./editor/ProjectManager";

async function saveLocalProject(project: EditProject, projectId = "local-project"): Promise<void> {
  const response = await fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}`, {
    body: JSON.stringify(project),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "本地项目保存失败");
  }
}

type ProjectResponse = {
  project: EditProject;
  missingMediaIds?: string[];
  mediaSources?: Record<string, string>;
};

/** 中文注释：App 负责协调当前工作区、项目加载和可恢复错误，编辑器页面只接收已加载的快照。 */
export function App() {
  const [project, setProject] = useState<EditProject | null>(null);
  const [missingMediaIds, setMissingMediaIds] = useState<string[]>([]);
  const [mediaSources, setMediaSources] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [projectId, setProjectId] = useState("local-project");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [workspaceRootPath, setWorkspaceRootPath] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [retryWorkspaceRootPath, setRetryWorkspaceRootPath] = useState<string | null>(null);

  /** 中文注释：只有明确确认项目不存在时创建空项目，损坏或服务异常必须停在可恢复错误页。 */
  const loadLocalProject = useCallback(async (nextProjectId = projectId): Promise<boolean> => {
    setLoadError(null);
    setBackupAvailable(false);
    try {
      const response = await fetch(`/api/workspace/projects/${encodeURIComponent(nextProjectId)}`);
      if (response.status === 404) {
        if (nextProjectId === "local-project") setProject(createEmptyProject());
        else throw new Error(`找不到编辑项目“${nextProjectId}”`);
        setProjectId(nextProjectId);
        return true;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        setBackupAvailable(Boolean((body as { backupAvailable?: boolean } | null)?.backupAvailable));
        throw new Error(body?.message ?? "无法读取本地项目");
      }
      setBackupAvailable(false);
      const value = await response.json() as EditProject | ProjectResponse;
      if ("project" in value) {
        setMissingMediaIds(value.missingMediaIds ?? []);
        setMediaSources(value.mediaSources ?? {});
        setProject(value.project);
        setProjectId(nextProjectId);
        return true;
      }
      setProject(value);
      setProjectId(nextProjectId);
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取本地项目");
      return false;
    }
  }, [projectId]);

  useEffect(() => {
    void loadLocalProject();
  }, [loadLocalProject, loadVersion]);

  useEffect(() => {
    void fetch("/api/workspace/projects").then((response) => response.ok ? response.json() : []).then((value) => {
      const loaded = value as ProjectSummary[];
      setProjects([{ id: projectId, name: projectId }, ...loaded.filter((item) => item.id !== projectId)]);
    }).catch(() => undefined);
  }, [projectId, project]);

  useEffect(() => {
    void fetch("/api/workspace/recent").then((response) => response.ok ? response.json() : []).then((value) => {
      const loaded = value as RecentWorkspace[];
      setRecentWorkspaces(loaded);
      if (!workspaceRootPath && loaded[0]) setWorkspaceRootPath(loaded[0].rootPath);
    }).catch(() => undefined);
  }, [projectId, workspaceRootPath]);

  /** 中文注释：打开工作区成功后重新加载默认项目，项目和素材列表由新工作区重新提供。 */
  const openWorkspace = (rootPath: string) => {
    if (!window.confirm("切换工作区可能丢失尚未自动保存的编辑，确定继续吗？")) return;
    setWorkspaceError(null);
    setRetryWorkspaceRootPath(rootPath);
    void fetch("/api/workspace/open", { body: JSON.stringify({ rootPath }), headers: { "Content-Type": "application/json" }, method: "POST" })
      .then(async (response) => { if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "工作区打开失败"); return response.json(); })
      .then(async (value) => {
        setWorkspaceRootPath(value.rootPath as string);
        setRecentWorkspaces(value.recentWorkspaces as RecentWorkspace[]);
        if (!await loadLocalProject("local-project")) throw new Error("工作区中的默认项目无法读取");
      })
      .catch((error) => setWorkspaceError(error instanceof Error ? error.message : "工作区打开失败"));
  };

  /** 中文注释：重试只重放最近一次失败的路径，当前项目快照在失败期间始终保留。 */
  const retryWorkspace = () => {
    if (retryWorkspaceRootPath) openWorkspace(retryWorkspaceRootPath);
  };

  /** 中文注释：切换项目先提示未保存风险，确认后才替换当前编辑器快照。 */
  const openProject = (nextProjectId: string) => {
    if (nextProjectId === projectId) return;
    if (window.confirm("切换项目可能丢失尚未自动保存的编辑，确定继续吗？")) void loadLocalProject(nextProjectId);
  };

  const createProject = (nextProjectId: string) => {
    void fetch(`/api/workspace/projects/${encodeURIComponent(nextProjectId)}`, {
      body: JSON.stringify(createEmptyProject()), headers: { "Content-Type": "application/json" }, method: "POST",
    }).then((response) => { if (!response.ok) throw new Error("创建编辑项目失败"); return loadLocalProject(nextProjectId); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "创建编辑项目失败"));
  };

  const renameProject = (currentId: string, nextProjectId: string) => {
    void fetch(`/api/workspace/projects/${encodeURIComponent(currentId)}`, {
      body: JSON.stringify({ name: nextProjectId }), headers: { "Content-Type": "application/json" }, method: "PATCH",
    }).then((response) => { if (!response.ok) throw new Error("重命名编辑项目失败"); setProjectId(nextProjectId); return loadLocalProject(nextProjectId); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "重命名编辑项目失败"));
  };

  const copyProject = (currentId: string, nextProjectId: string) => {
    void fetch(`/api/workspace/projects/${encodeURIComponent(currentId)}/copy`, {
      body: JSON.stringify({ name: nextProjectId }), headers: { "Content-Type": "application/json" }, method: "POST",
    }).then((response) => { if (!response.ok) throw new Error("复制编辑项目失败"); return loadLocalProject(nextProjectId); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "复制编辑项目失败"));
  };

  const deleteProject = (currentId: string) => {
    if (!window.confirm("删除项目只会删除项目记录，不会删除共享视频素材。确定继续吗？")) return;
    void fetch(`/api/workspace/projects/${encodeURIComponent(currentId)}`, { method: "DELETE" })
      .then((response) => { if (!response.ok) throw new Error("删除编辑项目失败"); setProjectId("local-project"); return loadLocalProject("local-project"); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "删除编辑项目失败"));
  };

  /** 中文注释：恢复入口显式调用备份恢复接口，避免读取异常时静默覆盖原项目。 */
  const recoverProject = () => {
    void fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}?recover=backup`)
      .then(async (response) => {
        if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "备份恢复失败");
        return loadLocalProject(projectId);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "备份恢复失败"));
  };

  // 中文注释：Store 必须在页面生命周期内稳定，避免 React 重渲染时丢失撤销栈和自动保存订阅。
  const store = useMemo(() => project ? createEditorStore(project) : null, [project]);
  const currentWorkspaceName = recentWorkspaces.find((workspace) => workspace.rootPath === workspaceRootPath)?.name ?? recentWorkspaces[0]?.name ?? "本地工作区";
  if (!project || !store) {
    return (
      <main>
        {loadError ? (
          <section role="alert">
            <h1>本地项目无法打开</h1>
            <p>{loadError}</p>
            <button onClick={() => setLoadVersion((version) => version + 1)} type="button">重试读取</button>
            {backupAvailable ? <button onClick={recoverProject} type="button">从最近备份恢复</button> : null}
            <p>请检查本地服务和项目文件；确认项目不存在时才会创建空项目。</p>
          </section>
        ) : <p>正在打开本地工作区…</p>}
      </main>
    );
  }
  const visibleWorkspaceError = workspaceError ?? loadError;
  return <EditorPage currentWorkspaceName={currentWorkspaceName} mediaSources={mediaSources} missingMediaIds={missingMediaIds} onCopyProject={copyProject} onCreateProject={createProject} onDeleteProject={deleteProject} onDismissWorkspaceError={() => { setWorkspaceError(null); setLoadError(null); }} onOpenProject={openProject} onOpenWorkspace={openWorkspace} onRenameProject={renameProject} onRetryWorkspace={workspaceError ? retryWorkspace : () => setLoadVersion((version) => version + 1)} onSaveProject={(snapshot) => saveLocalProject(snapshot, projectId)} projectId={projectId} projects={projects} recentWorkspaces={recentWorkspaces} store={store} workspaceError={visibleWorkspaceError} />;
}
