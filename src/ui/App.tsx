import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEditorStore } from "../domain/editor/editor-store";
import { createEmptyProject } from "../domain/project/factories";
import type { VideoWorkspace } from "../domain/workspace/model";
import type { AutosaveStatus } from "./editor/SaveIndicator";
import { EditorPage } from "./editor/EditorPage";
import { NavigationConfirmDialog } from "./editor/NavigationConfirmDialog";
import type { WorkspaceSummary } from "./editor/ProjectManager";
import { ThemeProvider, ThemeSelector } from "./theme/ThemeProvider";
import "./editor/editor.css";

type WorkspaceResponse = { workspace: VideoWorkspace; missingMediaIds?: string[]; mediaSources?: Record<string, string>; backupAvailable?: boolean };
type AppPhase = "loading" | "empty" | "editor" | "error";
type PendingNavigation = { destination: string; execute: () => void } | null;

/** 中文注释：工作区快照只通过稳定工作区名称保存，浏览器不会接触或选择实际存储目录。 */
async function saveVideoWorkspace(workspace: VideoWorkspace, workspaceId: string): Promise<void> {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    body: JSON.stringify(workspace),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "视频工作区保存失败");
  }
}

/** 中文注释：空工作区库是首次使用的正常入口，只要求用户命名即将制作的视频。 */
function WorkspaceLibraryStart({ backupAvailable, error, onCreateWorkspace, onRecover, onRetry }: { backupAvailable: boolean; error: string | null; onCreateWorkspace: (name: string) => Promise<void>; onRecover: () => void; onRetry: () => void }) {
  const [workspaceName, setWorkspaceName] = useState("");
  return (
    <main className="workspace-start">
      <section aria-label="空工作区库" className="workspace-start__card" role="region">
        <div className="workspace-start__toolbar"><ThemeSelector /></div>
        <p className="workspace-start__eyebrow">FRAME / FLOW · 本地优先</p>
        <h1>创建第一个视频工作区</h1>
        <p>新建工作区后即可导入素材并开始制作；各工作区的素材和时间轴彼此独立。</p>
        {error ? <><p className="workspace-start__error" role="alert">{error}</p><button onClick={onRetry} type="button">重试</button>{backupAvailable ? <button onClick={onRecover} type="button">从最近备份恢复</button> : null}</> : null}
        <label>视频工作区名称<input aria-label="新建视频工作区名称" onChange={(event) => setWorkspaceName(event.target.value)} placeholder="例如：知识视频" value={workspaceName} /></label>
        <button className="workspace-start__primary" onClick={() => { void onCreateWorkspace(workspaceName).catch(() => undefined); }} type="button">新建视频工作区</button>
      </section>
    </main>
  );
}

/** 中文注释：App 只协调工作区选择、切换和自动保存状态；编辑器内部操作仍由 EditorPage 与 EditorStore 管理。 */
export function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>;
}

/** 中文注释：应用内容与主题提供器分层，确保启动页和编辑器共用同一主题状态。 */
function AppContent() {
  const [phase, setPhase] = useState<AppPhase>("loading");
  const [workspace, setWorkspace] = useState<VideoWorkspace | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [missingMediaIds, setMissingMediaIds] = useState<string[]>([]);
  const [mediaSources, setMediaSources] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backupAvailable, setBackupAvailable] = useState(false);
  const [failedWorkspaceId, setFailedWorkspaceId] = useState<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const activeWorkspaceRef = useRef<VideoWorkspace | null>(null);

  useEffect(() => {
    activeWorkspaceRef.current = workspace;
  }, [workspace]);

  /** 中文注释：成功加载时一次替换快照和私有素材地址；失败不覆盖正在编辑的另一个工作区。 */
  const loadWorkspace = useCallback(async (nextWorkspaceId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(nextWorkspaceId)}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { backupAvailable?: boolean; code?: string; message?: string } | null;
        const canRecover = body?.code === "corrupt_project" && body.backupAvailable === true;
        setBackupAvailable(canRecover);
        setFailedWorkspaceId(canRecover ? nextWorkspaceId : null);
        setRecoveryAvailable(canRecover);
        throw new Error(body?.message ?? "无法读取视频工作区");
      }
      const value = await response.json() as WorkspaceResponse;
      setWorkspace(value.workspace);
      setWorkspaceId(nextWorkspaceId);
      setMediaSources(value.mediaSources ?? {});
      setMissingMediaIds(value.missingMediaIds ?? []);
      setBackupAvailable(value.backupAvailable === true);
      setFailedWorkspaceId(null);
      setRecoveryAvailable(false);
      setLoadError(null);
      setPhase("editor");
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取视频工作区");
      if (!activeWorkspaceRef.current) setPhase("error");
      return false;
    }
  }, []);

  /** 中文注释：工作区列表按服务端最近编辑顺序返回，空列表直接进入创建首个视频的状态。 */
  const refreshWorkspaces = useCallback(async (preferredWorkspaceId?: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/workspaces");
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "无法读取视频工作区列表");
      }
      const loaded = await response.json() as WorkspaceSummary[];
      setWorkspaces(loaded);
      if (loaded.length === 0) {
        setWorkspace(null);
        setWorkspaceId(null);
        setBackupAvailable(false);
        setFailedWorkspaceId(null);
        setRecoveryAvailable(false);
        setPhase("empty");
        return true;
      }
      return loadWorkspace(loaded.find((item) => item.id === preferredWorkspaceId)?.id ?? loaded[0].id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "无法读取视频工作区列表");
      setBackupAvailable(false);
      setFailedWorkspaceId(null);
      setRecoveryAvailable(false);
      setPhase("error");
      return false;
    }
  }, [loadWorkspace]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  /** 中文注释：只有保存尚未稳定时才拦截工作区切换，正常保存完成后 A/B 可直接切换。 */
  const requestNavigation = (destination: string, execute: () => void) => {
    if (autosaveStatus === "saving" || autosaveStatus === "error") setPendingNavigation({ destination, execute });
    else execute();
  };

  /** 中文注释：创建工作区先在服务端校验名称安全与唯一性，再刷新并打开新工作区。 */
  const createWorkspace = async (name: string): Promise<void> => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      setLoadError("请输入视频工作区名称");
      setBackupAvailable(false);
      setFailedWorkspaceId(null);
      setRecoveryAvailable(false);
      throw new Error("请输入视频工作区名称");
    }
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(normalizedName)}`, {
        body: JSON.stringify(createEmptyProject()),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "创建视频工作区失败");
      if (!await refreshWorkspaces(normalizedName)) throw new Error("无法读取视频工作区列表");
    } catch (error) {
      // 中文注释：编辑器内由发起操作的自定义表单展示失败；只有启动页仍需把失败写入页面级入口。
      if (phase !== "editor") setLoadError(error instanceof Error ? error.message : "创建视频工作区失败");
      setBackupAvailable(false);
      setFailedWorkspaceId(null);
      setRecoveryAvailable(false);
      throw error;
    }
  };

  /** 中文注释：重命名移动整个私有工作区目录，刷新后继续编辑同一份时间轴与素材。 */
  const renameWorkspace = async (currentId: string, nextId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(currentId)}`, {
        body: JSON.stringify({ name: nextId }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "重命名视频工作区失败");
      if (!await refreshWorkspaces(nextId)) throw new Error("无法读取视频工作区列表");
    } catch (error) {
      // 中文注释：重命名失败保留在工作区管理对话框中，避免与工作区加载故障混为同一个全局错误。
      setBackupAvailable(false);
      setFailedWorkspaceId(null);
      setRecoveryAvailable(false);
      throw error;
    }
  };

  /** 中文注释：删除当前工作区只影响其私有目录，服务端刷新后自动选择最近编辑的另一个工作区。 */
  const deleteWorkspace = async (currentId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(currentId)}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "删除视频工作区失败");
      }
      if (!await refreshWorkspaces()) throw new Error("无法读取视频工作区列表");
    } catch (error) {
      // 中文注释：删除失败由确认流程返回管理对话框，当前编辑状态和工作区加载状态都保持不变。
      setBackupAvailable(false);
      setFailedWorkspaceId(null);
      setRecoveryAvailable(false);
      throw error;
    }
  };

  const openWorkspace = (nextWorkspaceId: string) => {
    if (nextWorkspaceId === workspaceId) return;
    requestNavigation(nextWorkspaceId, () => { void loadWorkspace(nextWorkspaceId); });
  };

  /** 中文注释：恢复 API 只替换失败工作区自身的快照，成功后重新走标准读取流程以同步素材状态。 */
  const recoverWorkspace = () => {
    const targetWorkspaceId = failedWorkspaceId;
    if (!targetWorkspaceId || !recoveryAvailable) return;
    void fetch(`/api/workspaces/${encodeURIComponent(targetWorkspaceId)}/recover`, { method: "POST" })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { message?: string } | null;
          throw new Error(body?.message ?? "无法从最近备份恢复视频工作区");
        }
        await loadWorkspace(targetWorkspaceId);
      }).catch((error) => setLoadError(error instanceof Error ? error.message : "无法从最近备份恢复视频工作区"));
  };

  const store = useMemo(() => workspace ? createEditorStore(workspace) : null, [workspace]);

  /** 中文注释：保存回调只在工作区切换时更新，避免自动保存状态本身触发编辑器控制器重建并反复延后保存。 */
  const saveCurrentWorkspace = useCallback((snapshot: VideoWorkspace): Promise<void> => {
    if (!workspaceId) return Promise.reject(new Error("当前没有可保存的视频工作区"));
    return saveVideoWorkspace(snapshot, workspaceId);
  }, [workspaceId]);

  if (phase === "loading") return <main className="workspace-start"><p>正在读取视频工作区…</p></main>;
  if (phase === "empty" || phase === "error" || !workspace || !store || !workspaceId) return <WorkspaceLibraryStart backupAvailable={recoveryAvailable && backupAvailable} error={loadError} onCreateWorkspace={createWorkspace} onRecover={recoverWorkspace} onRetry={() => void refreshWorkspaces()} />;

  return <><EditorPage backupAvailable={recoveryAvailable && backupAvailable} mediaSources={mediaSources} missingMediaIds={missingMediaIds} onAutosaveStatusChange={setAutosaveStatus} onCreateWorkspace={createWorkspace} onDeleteWorkspace={deleteWorkspace} onDismissProjectError={() => { setLoadError(null); setBackupAvailable(false); setFailedWorkspaceId(null); setRecoveryAvailable(false); }} onOpenWorkspace={openWorkspace} onRecoverProject={recoverWorkspace} onRenameWorkspace={renameWorkspace} onRetryProject={() => void loadWorkspace(workspaceId)} onSaveProject={saveCurrentWorkspace} projectError={loadError} store={store} workspaceId={workspaceId} workspaces={workspaces} /><NavigationConfirmDialog destination={pendingNavigation?.destination ?? ""} onCancel={() => setPendingNavigation(null)} onConfirm={() => { const action = pendingNavigation?.execute; setPendingNavigation(null); action?.(); }} open={pendingNavigation !== null} /></>;
}
