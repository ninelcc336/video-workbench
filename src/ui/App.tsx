import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEditorStore } from "../domain/editor/editor-store";
import { createEmptyProject } from "../domain/project/factories";
import type { EditProject } from "../domain/project/model";
import type { AutosaveStatus } from "./editor/SaveIndicator";
import { EditorPage } from "./editor/EditorPage";
import { NavigationConfirmDialog } from "./editor/NavigationConfirmDialog";
import type { ProjectSummary } from "./editor/ProjectManager";
import "./editor/editor.css";

type ProjectResponse = { backupAvailable?: boolean; project: EditProject; missingMediaIds?: string[]; mediaSources?: Record<string, string> };
type AppPhase = "loading" | "empty" | "editor" | "error";
type PendingNavigation = { destination: string; execute: () => void } | null;

/** 中文注释：保存项目只通过稳定项目名称写入固定本地项目库，浏览器永远不接触目录路径。 */
async function saveLocalProject(project: EditProject, projectId: string): Promise<void> {
  const response = await fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}`, { body: JSON.stringify(project), headers: { "Content-Type": "application/json" }, method: "PUT" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "本地项目保存失败");
  }
}

/** 中文注释：空项目库是正常首次状态，只提供命名创建入口而不展示任何存储目录细节。 */
function ProjectLibraryStart({ backupAvailable, error, onCreateProject, onRecoverProject, onRetry }: { backupAvailable: boolean; error: string | null; onCreateProject: (name: string) => void; onRecoverProject: () => void; onRetry: () => void }) {
  const [projectName, setProjectName] = useState("");
  return (
    <main className="workspace-start">
      <section className="workspace-start__card" role="region" aria-label="空项目库">
        <p className="workspace-start__eyebrow">FRAME / FLOW · 本地优先</p>
        <h1>创建第一个编辑项目</h1>
        <p>本地项目库已准备好。新建项目后，即可导入视频素材并开始编辑。</p>
        {error ? <p className="workspace-start__error" role="alert">{error}</p> : null}
        {error ? <button onClick={onRetry} type="button">重试</button> : null}
        {error && backupAvailable ? <button onClick={onRecoverProject} type="button">从最近备份恢复</button> : null}
        <label>编辑项目名称<input aria-label="新建编辑项目名称" onChange={(event) => setProjectName(event.target.value)} placeholder="例如：知识视频" value={projectName} /></label>
        <button className="workspace-start__primary" onClick={() => onCreateProject(projectName)} type="button">新建编辑项目</button>
      </section>
    </main>
  );
}

/** 中文注释：App 只协调固定项目库启动、项目导航与恢复，具体编辑能力仍由 EditorPage 承担。 */
export function App() {
  const [phase, setPhase] = useState<AppPhase>("loading");
  const [project, setProject] = useState<EditProject | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [missingMediaIds, setMissingMediaIds] = useState<string[]>([]);
  const [mediaSources, setMediaSources] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [retryProjectId, setRetryProjectId] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const activeProjectRef = useRef<EditProject | null>(null);

  useEffect(() => {
    // 中文注释：读取失败时用 ref 判断是否仍有可继续编辑的项目，避免错误覆盖当前内容。
    activeProjectRef.current = project;
  }, [project]);

  /** 中文注释：成功后一次性替换项目快照和素材地址；失败时保留当前编辑器并提供恢复入口。 */
  const loadProject = useCallback(async (nextProjectId: string): Promise<boolean> => {
    setRetryProjectId(nextProjectId);
    try {
      const response = await fetch(`/api/workspace/projects/${encodeURIComponent(nextProjectId)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { backupAvailable?: boolean; message?: string } | null;
        setBackupAvailable(Boolean(body?.backupAvailable));
        throw new Error(body?.message ?? "无法读取编辑项目");
      }
      const value = await response.json() as ProjectResponse;
      setProject(value.project);
      setProjectId(nextProjectId);
      setMediaSources(value.mediaSources ?? {});
      setMissingMediaIds(value.missingMediaIds ?? []);
      setLoadError(null);
      setBackupAvailable(false);
      setRetryProjectId(null);
      setPhase("editor");
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取编辑项目");
      if (!activeProjectRef.current) setPhase("error");
      return false;
    }
  }, []);

  /** 中文注释：固定项目库按仓储排序返回项目；没有项目时进入可操作的空项目库状态。 */
  const refreshProjects = useCallback(async (preferredProjectId?: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/workspace/projects");
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "无法读取编辑项目列表");
      }
      const loaded = await response.json() as ProjectSummary[];
      setProjects(loaded);
      if (loaded.length === 0) {
        setProject(null);
        setProjectId(null);
        setLoadError(null);
        setPhase("empty");
        return true;
      }
      return await loadProject(loaded.find((item) => item.id === preferredProjectId)?.id ?? loaded[0].id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取编辑项目列表");
      setPhase("error");
      return false;
    }
  }, [loadProject]);

  useEffect(() => {
    // 中文注释：首次启动直接读取固定项目库，不再依赖最近目录或目录选择。
    void refreshProjects();
  }, [refreshProjects]);

  /** 中文注释：仅在自动保存尚未稳定时确认项目切换，取消后选择器保持当前项目。 */
  const requestNavigation = (destination: string, execute: () => void) => {
    if (autosaveStatus === "saving" || autosaveStatus === "error") setPendingNavigation({ destination, execute });
    else execute();
  };

  /** 中文注释：新建项目会裁剪输入；路径安全与大小写冲突仍由服务端统一裁决。 */
  const createProject = (name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setLoadError("请输入编辑项目名称");
      return;
    }
    void fetch(`/api/workspace/projects/${encodeURIComponent(normalizedName)}`, { body: JSON.stringify(createEmptyProject()), headers: { "Content-Type": "application/json" }, method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "创建编辑项目失败");
        return refreshProjects(normalizedName);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "创建编辑项目失败"));
  };

  /** 中文注释：重命名后重新读取排序后的项目列表，项目 JSON 与素材 ID 不在浏览器中重写。 */
  const renameProject = (currentId: string, nextProjectId: string) => {
    void fetch(`/api/workspace/projects/${encodeURIComponent(currentId)}`, { body: JSON.stringify({ name: nextProjectId }), headers: { "Content-Type": "application/json" }, method: "PATCH" })
      .then(async (response) => {
        if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "重命名编辑项目失败");
        return refreshProjects(nextProjectId.trim());
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "重命名编辑项目失败"));
  };

  /** 中文注释：删除后按仓储最近更新时间自动打开下一项目；最后一项删除后显示空项目库状态。 */
  const deleteProject = (currentId: string) => {
    void fetch(`/api/workspace/projects/${encodeURIComponent(currentId)}`, { method: "DELETE" })
      .then(async (response) => {
        if (!response.ok) throw new Error("删除编辑项目失败");
        return refreshProjects();
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "删除编辑项目失败"));
  };

  const openProject = (nextProjectId: string) => {
    if (nextProjectId === projectId) return;
    requestNavigation(nextProjectId, () => { void loadProject(nextProjectId); });
  };

  /** 中文注释：恢复目标始终是刚刚读取失败的项目，避免把当前仍在编辑的项目误写为备份内容。 */
  const recoverProject = () => {
    const recoveryProjectId = retryProjectId ?? projectId;
    if (!recoveryProjectId) return;
    void fetch(`/api/workspace/projects/${encodeURIComponent(recoveryProjectId)}?recover=backup`)
      .then(async (response) => {
        if (!response.ok) throw new Error("备份恢复失败");
        await loadProject(recoveryProjectId);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "备份恢复失败"));
  };

  /** 中文注释：项目库初始化失败时先请求服务端重试迁移，再重新读取项目列表，不创建虚假的空项目。 */
  const retryProjectLibrary = () => {
    void fetch("/api/workspace/retry-initialization", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "本地项目库仍不可用");
        return refreshProjects();
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "本地项目库仍不可用"));
  };

  const store = useMemo(() => project ? createEditorStore(project) : null, [project]);

  if (phase === "loading") return <main className="workspace-start"><p>正在读取本地项目库…</p></main>;
  if (phase === "empty" || phase === "error" || !project || !store || !projectId) return <ProjectLibraryStart backupAvailable={backupAvailable} error={loadError} onCreateProject={createProject} onRecoverProject={recoverProject} onRetry={retryProjectLibrary} />;

  return <><EditorPage backupAvailable={backupAvailable} mediaSources={mediaSources} missingMediaIds={missingMediaIds} onAutosaveStatusChange={setAutosaveStatus} onCreateProject={createProject} onDeleteProject={deleteProject} onDismissProjectError={() => setLoadError(null)} onOpenProject={openProject} onRecoverProject={recoverProject} onRenameProject={renameProject} onRetryProject={() => { if (retryProjectId) void loadProject(retryProjectId); }} onSaveProject={(snapshot) => saveLocalProject(snapshot, projectId)} projectError={loadError} projectId={projectId} projects={projects} store={store} /><NavigationConfirmDialog destination={pendingNavigation?.destination ?? ""} onCancel={() => setPendingNavigation(null)} onConfirm={() => { const action = pendingNavigation?.execute; setPendingNavigation(null); action?.(); }} open={pendingNavigation !== null} /></>;
}
