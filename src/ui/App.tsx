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

/** 中文注释：App 只组装本地空项目和编辑器页面，后续可在这里接入工作区打开流程。 */
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

  /** 中文注释：只有明确确认项目不存在时创建空项目，损坏或服务异常必须停在可恢复错误页。 */
  const loadLocalProject = useCallback(async (nextProjectId = projectId) => {
    setLoadError(null);
    setBackupAvailable(false);
    setProject(null);
    try {
      const response = await fetch(`/api/workspace/projects/${encodeURIComponent(nextProjectId)}`);
      if (response.status === 404) {
        if (nextProjectId === "local-project") setProject(createEmptyProject());
        else throw new Error(`找不到编辑项目“${nextProjectId}”`);
        setProjectId(nextProjectId);
        return;
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
        return;
      }
      setProject(value);
      setProjectId(nextProjectId);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取本地项目");
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
    void fetch("/api/workspace/recent").then((response) => response.ok ? response.json() : []).then((value) => setRecentWorkspaces(value as RecentWorkspace[])).catch(() => undefined);
  }, [projectId]);

  /** 中文注释：打开工作区成功后重新加载默认项目，项目和素材列表由新工作区重新提供。 */
  const openWorkspace = (rootPath: string) => {
    if (!window.confirm("切换工作区可能丢失尚未自动保存的编辑，确定继续吗？")) return;
    void fetch("/api/workspace/open", { body: JSON.stringify({ rootPath }), headers: { "Content-Type": "application/json" }, method: "POST" })
      .then(async (response) => { if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "工作区打开失败"); return response.json(); })
      .then((value) => { setRecentWorkspaces(value.recentWorkspaces as RecentWorkspace[]); return loadLocalProject("local-project"); })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "工作区打开失败"));
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
  return <EditorPage mediaSources={mediaSources} missingMediaIds={missingMediaIds} onCopyProject={copyProject} onCreateProject={createProject} onDeleteProject={deleteProject} onOpenProject={openProject} onOpenWorkspace={openWorkspace} onRenameProject={renameProject} onSaveProject={(snapshot) => saveLocalProject(snapshot, projectId)} projectId={projectId} projects={projects} recentWorkspaces={recentWorkspaces} store={store} />;
}
