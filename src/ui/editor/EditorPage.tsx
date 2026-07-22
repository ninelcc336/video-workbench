import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorCommand } from "../../domain/editor/commands";
import type { EditorStore } from "../../domain/editor/editor-store";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject, EffectClip, VideoClip } from "../../domain/project/model";
import { applyPreset, createPreset, type Preset } from "../../domain/assets/preset-model";
import { applyVideoTemplate, createVideoTemplate, type VideoTemplate } from "../../domain/assets/video-template-model";
import { getTemplate, getTemplateDefaultParams } from "../../domain/templates/registry";
import type { MediaSources } from "../../remotion/media";
import type { MediaAsset } from "../../server/workspace/media-repository";
import type { ExportSettings } from "../../domain/project/model";
import { getCompositionDurationInFrames } from "../../remotion/EditorComposition";
import { clampPreviewFrame } from "../preview/PreviewPlayer";
import { findNearestLegalVideoStart } from "../../domain/editor/clip-ranges";
import { createAutosaveController, SaveIndicator, type AutosaveStatus, useAutosaveState } from "./SaveIndicator";
import { ExportDialog } from "./ExportDialog";
import { ResetProjectDialog } from "./ResetProjectDialog";
import { RenderStatus } from "./RenderStatus";
import { PresetDialog } from "./PresetDialog";
import { VideoTemplateDialog } from "./VideoTemplateDialog";
import { MediaBin } from "./MediaBin";
import { PreviewCanvas } from "./PreviewCanvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { TemplateLibrary } from "./TemplateLibrary";
import { Timeline, type ClipKind } from "./Timeline";
import { importMediaFile } from "./media-import";
import { getAvailableEffectTrackId } from "./effect-track-layout";
import { EditorPanelLayout } from "./EditorPanelLayout";
import { ProjectManager, type ProjectSummary } from "./ProjectManager";
import "./editor.css";

export type EditorPageProps = {
  store?: EditorStore;
  mediaSources?: MediaSources;
  missingMediaIds?: string[];
  onSaveProject?: (project: EditProject) => Promise<void>;
  projectId?: string;
  projects?: ProjectSummary[];
  onOpenProject?: (projectId: string) => void;
  onCreateProject?: (projectId: string) => void;
  onRenameProject?: (projectId: string, nextProjectId: string) => void;
  onDeleteProject?: (projectId: string) => void;
  projectError?: string | null;
  onRetryProject?: () => void;
  onDismissProjectError?: () => void;
  onAutosaveStatusChange?: (status: AutosaveStatus) => void;
  backupAvailable?: boolean;
  onRecoverProject?: () => void;
};

function createId(prefix: string): string {
  const randomUUID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${randomUUID}`;
}

function getClip(project: EditProject, id: string | null): EffectClip | null {
  if (!id) return null;
  return project.effectClips.find((clip) => clip.id === id) ?? null;
}

type ClipboardClip =
  | { kind: "video"; clip: VideoClip }
  | { kind: "effect"; clip: EffectClip };

/** 中文注释：复制片段时深拷贝可变参数，避免后续属性编辑反向污染内部剪贴板。 */
function cloneClipboardValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneClipboardValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneClipboardValue(nestedValue)]),
    );
  }
  return value;
}

/** 中文注释：只保存片段业务字段，不保存 React 对象或对原项目数组的引用。 */
function cloneClipboardClip(clip: VideoClip | EffectClip): VideoClip | EffectClip {
  if ("params" in clip) {
    return { ...clip, params: cloneClipboardValue(clip.params) as Record<string, unknown> };
  }
  return { ...clip };
}

/** 中文注释：时间轴快捷键不应抢占输入控件的系统编辑行为。 */
function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) || element.isContentEditable;
}

/** 中文注释：页面层把时间轴事件翻译成 EditorStore 公共命令，组件自身不直接修改项目数组。 */
export function EditorPage({ store: providedStore, mediaSources: initialMediaSources = {}, missingMediaIds: initialMissingMediaIds = [], onSaveProject, projectId = "", projects = [], onOpenProject, onCreateProject, onRenameProject, onDeleteProject, projectError = null, onRetryProject, onDismissProjectError, onAutosaveStatusChange, backupAvailable = false, onRecoverProject }: EditorPageProps) {
  const store = useMemo(() => providedStore ?? createEditorStoreForPage(), [providedStore]);
  const autosave = useMemo(() => createAutosaveController(onSaveProject ?? (async () => undefined)), [onSaveProject]);
  const autosaveState = useAutosaveState(autosave);
  const [project, setProject] = useState(store.getSnapshot());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [previewProject, setPreviewProject] = useState<EditProject | null>(null);
  const [mediaSources, setMediaSources] = useState<MediaSources>(initialMediaSources);
  const [missingMediaIds, setMissingMediaIds] = useState(initialMissingMediaIds);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [renderSnapshot, setRenderSnapshot] = useState<import("../../server/render/render-job").RenderJobSnapshot | null>(null);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [videoTemplateOpen, setVideoTemplateOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [videoTemplates, setVideoTemplates] = useState<VideoTemplate[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [relinkedMediaId, setRelinkedMediaId] = useState<string | null>(null);
  // 中文注释：只记录最近一次重置前的播放头，以便紧接着撤销重置时恢复用户正在查看的位置。
  const frameBeforeProjectReset = useRef<number | null>(null);
  const clipboardRef = useRef<ClipboardClip | null>(null);

  useEffect(() => {
    // 中文注释：App 只需保存是否存在待保存编辑，实际自动保存逻辑仍封装在编辑页。
    onAutosaveStatusChange?.(autosaveState.status);
  }, [autosaveState.status, onAutosaveStatusChange]);

  useEffect(() => store.subscribe((snapshot) => {
    setProject(snapshot);
    autosave.schedule(snapshot);
  }), [autosave, store]);

  useEffect(() => {
    // 中文注释：工作区切换会生成新 Store，媒体地址和缺失标记也必须同步到新项目快照。
    setMediaSources(initialMediaSources);
    setMissingMediaIds(initialMissingMediaIds);
  }, [store]);

  useEffect(() => () => {
    // 中文注释：关闭项目或切换工作区前尽量冲刷待保存快照，避免防抖窗口内的编辑丢失。
    void autosave.flush();
  }, [autosave]);

  useEffect(() => {
    // 中文注释：个人资产在工作区恢复后重新加载，页面内存不再是唯一来源。
    void Promise.all([
      fetch("/api/workspace/presets").then((response) => response.ok ? response.json() : []),
      fetch("/api/workspace/video-templates").then((response) => response.ok ? response.json() : []),
      fetch("/api/workspace/media").then((response) => response.ok ? response.json() : []),
    ]).then(([loadedPresets, loadedTemplates, loadedMedia]) => {
      setPresets(loadedPresets as Preset[]);
      setVideoTemplates(loadedTemplates as VideoTemplate[]);
      setMediaAssets(loadedMedia as MediaAsset[]);
    }).catch(() => undefined);
  }, [store]);

  useEffect(() => {
    // 中文注释：项目时长变化后同步收紧播放头，避免 Player 访问项目末尾之外的帧。
    setCurrentFrame((frame) => clampPreviewFrame(frame, getCompositionDurationInFrames(project)));
  }, [project]);

  const dispatch = (command: EditorCommand) => {
    try {
      // 中文注释：重置后的其他编辑操作会改变历史栈，不能再把其撤销误判为撤销重置。
      if (command.type !== "reset-project") frameBeforeProjectReset.current = null;
      store.dispatch(command);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败，请检查时间轴范围");
    }
  };

  const visibleProject = previewProject ?? project;
  const selectedEffectClip = getClip(visibleProject, selectedClipId);
  const selectedTemplateName = selectedEffectClip ? getTemplate(selectedEffectClip.templateId, selectedEffectClip.templateVersion).name : undefined;

  /** 中文注释：拖动特效期间只更新页面级临时项目，让预览、选区和属性面板共享同一结果。 */
  const previewEffectParams = (clipId: string, params: Record<string, unknown>) => {
    const baseProject = previewProject ?? project;
    const nextProject: EditProject = {
      ...baseProject,
      videoClips: baseProject.videoClips.map((clip) => ({ ...clip })),
      effectClips: baseProject.effectClips.map((clip) => clip.id === clipId
        ? { ...clip, params: { ...clip.params, ...params } }
        : { ...clip, params: { ...clip.params } }),
    };
    setPreviewProject(nextProject);
  };

  /** 中文注释：画布手势结束后一次性提交最终参数，并清除页面级临时快照。 */
  const commitEffectParams = (clipId: string, params: Record<string, unknown>) => {
    dispatch({ type: "update-effect-params", clipId, params });
    setPreviewProject(null);
  };

  const addTemplate = (templateId: string) => {
    const template = getTemplate(templateId);
    const clip: EffectClip = {
      id: createId("effect"),
      templateId: template.id,
      templateVersion: template.version,
      trackId: getAvailableEffectTrackId(project.effectClips, currentFrame, template.defaultDurationInFrames),
      fromFrame: currentFrame,
      durationInFrames: template.defaultDurationInFrames,
      params: getTemplateDefaultParams(template),
    };
    dispatch({ type: "add-effect-clip", clip });
    setSelectedClipId(clip.id);
  };

  const addTemplateAtFrame = (template: ReturnType<typeof getTemplate>, frame: number) => {
    const fromFrame = Math.max(0, Math.round(frame));
    const clip: EffectClip = {
      id: createId("effect"),
      templateId: template.id,
      templateVersion: template.version,
      trackId: getAvailableEffectTrackId(project.effectClips, fromFrame, template.defaultDurationInFrames),
      fromFrame,
      durationInFrames: template.defaultDurationInFrames,
      params: getTemplateDefaultParams(template),
    };
    dispatch({ type: "add-effect-clip", clip });
    setSelectedClipId(clip.id);
  };

  const importMedia = async (file: File) => {
    try {
      const asset = await importMediaFile(file);
      const lastFrame = Math.max(0, ...project.videoClips.map((clip) => clip.fromFrame + clip.durationInFrames));
      const clipFps = project.videoClips.length === 0 && asset.fps ? Math.max(1, Math.round(asset.fps)) : project.settings.fps;
      const clip: VideoClip = {
        id: createId("video"),
        mediaId: asset.id,
        fromFrame: lastFrame,
        sourceStartFrame: 0,
        // 中文注释：优先使用素材真实时长，旧服务没有元数据时才用 5 秒兼容值。
        durationInFrames: Math.max(1, Math.round((asset.durationInSeconds ?? 5) * clipFps)),
        audioEnabled: true,
      };
      // 中文注释：预览也使用工作区稳定地址，关闭页面后项目仍可由素材 ID 恢复。
      setMediaSources((current) => ({ ...current, [asset.id]: `/api/workspace/media/${encodeURIComponent(asset.id)}` }));
      setMediaAssets((current) => [...current.filter((item) => item.id !== asset.id), asset]);
      setMissingMediaIds((current) => current.filter((mediaId) => mediaId !== asset.id));
      // 中文注释：素材原始尺寸随首次导入命令传入，由领域层安全决定是否匹配横屏编辑项目。
      if (asset.fpsWasFallback) setNotice("无法读取素材帧率，已按 30fps 导入。");
      dispatch({
        type: "add-video-clip",
        clip,
        sourceDimensions: { width: asset.width, height: asset.height, fps: asset.fps },
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "视频素材导入失败");
    }
  };

  /** 中文注释：重新关联沿用稳定媒体 ID，只更新素材文件和预览地址，不改项目画布或特效布局。 */
  const relinkMedia = async (mediaId: string, file: File) => {
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const response = await fetch(`/api/workspace/media/${encodeURIComponent(mediaId)}/relink`, { body: form, method: "POST" });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "重新关联素材失败");
      const asset = await response.json() as MediaAsset;
      setMediaAssets((current) => [...current.filter((item) => item.id !== mediaId), asset]);
      setMediaSources((current) => ({ ...current, [mediaId]: `/api/workspace/media/${encodeURIComponent(mediaId)}` }));
      setMissingMediaIds((current) => current.filter((id) => id !== mediaId));
      setRelinkedMediaId(mediaId);
      setNotice("素材已重新关联，原有时间轴和特效布局保持不变。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "重新关联素材失败"); }
  };

  /** 中文注释：素材重命名只更新展示名，项目快照继续使用稳定 mediaId。 */
  const renameMedia = (mediaId: string, name: string) => {
    void fetch(`/api/workspace/media/${encodeURIComponent(mediaId)}`, { body: JSON.stringify({ name }), headers: { "Content-Type": "application/json" }, method: "PATCH" })
      .then(async (response) => { if (!response.ok) throw new Error("素材重命名失败"); const asset = await response.json() as MediaAsset; setMediaAssets((current) => current.map((item) => item.id === mediaId ? asset : item)); })
      .catch((error) => setNotice(error instanceof Error ? error.message : "素材重命名失败"));
  };

  /** 中文注释：删除操作由服务端检查跨项目引用，前端只刷新成功后的资产列表。 */
  const deleteMedia = (mediaId: string) => {
    void fetch(`/api/workspace/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" })
      .then((response) => { if (!response.ok) throw new Error("素材仍被项目引用或删除失败"); setMediaAssets((current) => current.filter((item) => item.id !== mediaId)); })
      .catch((error) => setNotice(error instanceof Error ? error.message : "素材删除失败"));
  };

  /** 中文注释：撤销重新关联恢复服务端保存的上一份素材，并重新标记预览资源。 */
  const undoRelinkMedia = (mediaId: string) => {
    void fetch(`/api/workspace/media/${encodeURIComponent(mediaId)}/relink/undo`, { method: "POST" })
      .then(async (response) => { if (!response.ok) throw new Error("撤销素材重新关联失败"); const asset = await response.json() as MediaAsset; setMediaAssets((current) => current.map((item) => item.id === mediaId ? asset : item)); setRelinkedMediaId(null); })
      .catch((error) => setNotice(error instanceof Error ? error.message : "撤销素材重新关联失败"));
  };

  /** 中文注释：预览和时间轴共用同一个选择入口，传入 null 表示点击预览空白取消选择。 */
  const selectClip = (clipId: string | null) => setSelectedClipId(clipId);

  const seekFrame = (frame: number) => {
    setCurrentFrame(clampPreviewFrame(frame, getCompositionDurationInFrames(project)));
  };

  const resetProject = () => {
    // 中文注释：项目快照通过 Store 重置并进入撤销历史；页面级临时选区和播放状态同步归零。
    frameBeforeProjectReset.current = currentFrame;
    dispatch({ type: "reset-project" });
    setCurrentFrame(0);
    setSelectedClipId(null);
    setPreviewProject(null);
    setRenderSnapshot(null);
    setRenderJobId(null);
  };

  const undo = () => {
    const frame = frameBeforeProjectReset.current;
    store.undo();
    if (frame === null) return;
    // 中文注释：撤销重置后按已恢复的项目时长校正播放头，继续保持时间轴与 Remotion Player 同步。
    setCurrentFrame(clampPreviewFrame(frame, getCompositionDurationInFrames(store.getSnapshot())));
    frameBeforeProjectReset.current = null;
  };

  /** 中文注释：重做与顶部按钮共用 EditorStore 历史，播放头仍由项目时长同步校正。 */
  const redo = () => store.redo();

  /** 中文注释：复制只更新编辑器级剪贴板，不创建项目历史记录。 */
  const copySelectedClip = () => {
    const video = project.videoClips.find((clip) => clip.id === selectedClipId);
    if (video) {
      clipboardRef.current = { kind: "video", clip: cloneClipboardClip(video) as VideoClip };
      return;
    }
    const effect = project.effectClips.find((clip) => clip.id === selectedClipId);
    if (effect) clipboardRef.current = { kind: "effect", clip: cloneClipboardClip(effect) as EffectClip };
  };

  /** 中文注释：粘贴始终生成新片段并一次性提交，完成后自动选中新副本。 */
  const pasteSelectedClip = () => {
    const clipboard = clipboardRef.current;
    if (!clipboard) return;

    if (clipboard.kind === "video") {
      const source = clipboard.clip;
      const clip: VideoClip = {
        ...source,
        id: createId("video"),
        fromFrame: findNearestLegalVideoStart(project, null, currentFrame, source.durationInFrames),
      };
      dispatch({ type: "add-video-clip", clip });
      setSelectedClipId(clip.id);
      return;
    }

    const source = clipboard.clip;
    const clip: EffectClip = {
      ...source,
      id: createId("effect"),
      fromFrame: Math.max(0, Math.round(currentFrame)),
      trackId: getAvailableEffectTrackId(project.effectClips, currentFrame, source.durationInFrames),
      params: cloneClipboardValue(source.params) as Record<string, unknown>,
    };
    dispatch({ type: "add-effect-clip", clip });
    setSelectedClipId(clip.id);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!["c", "v", "z", "y"].includes(key)) return;
      event.preventDefault();
      if (key === "c") copySelectedClip();
      if (key === "v") pasteSelectedClip();
      if (key === "z") undo();
      if (key === "y") redo();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [currentFrame, project, selectedClipId]);

  const moveClip = (clipId: string, kind: ClipKind, fromFrame: number) => {
    dispatch(kind === "video" ? { type: "move-video-clip", clipId, fromFrame } : { type: "move-effect-clip", clipId, fromFrame });
  };

  const resizeClip = (clipId: string, kind: ClipKind, fromFrame: number, durationInFrames: number) => {
    dispatch(kind === "video"
      ? { type: "resize-video-clip", clipId, fromFrame, durationInFrames }
      : { type: "resize-effect-clip", clipId, fromFrame, durationInFrames });
  };

  const deleteClip = (clipId: string, kind: ClipKind) => {
    dispatch(kind === "video" ? { type: "delete-video-clip", clipId } : { type: "delete-effect-clip", clipId });
    setSelectedClipId((current) => current === clipId ? null : current);
  };

  const submitExport = async (settings: ExportSettings) => {
    if (missingMediaIds.length > 0) {
      setNotice("当前项目存在缺失素材，修复后才能导出视频。");
      return;
    }
    setExportOpen(false);
    try {
      const response = await fetch("/api/render", {
        body: JSON.stringify({ project: { ...project, export: settings }, outputPath: "export.mp4", mediaSources }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const initial = await response.json() as { jobId?: string; snapshot?: import("../../server/render/render-job").RenderJobSnapshot; message?: string };
      if (!response.ok || !initial.jobId || !initial.snapshot) throw new Error(initial.message ?? "导出任务创建失败");
      setRenderJobId(initial.jobId);
      setRenderSnapshot(initial.snapshot);
      void pollRenderJob(initial.jobId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导出任务创建失败");
    }
  };

  /** 中文注释：轮询只更新任务快照，编辑器仍可继续修改当前项目。 */
  const pollRenderJob = async (jobId: string): Promise<void> => {
    const statusResponse = await fetch(`/api/render/${jobId}`);
    const snapshot = await statusResponse.json() as import("../../server/render/render-job").RenderJobSnapshot;
    setRenderSnapshot(snapshot);
    if (snapshot.status === "preparing" || snapshot.status === "rendering") window.setTimeout(() => void pollRenderJob(jobId), 250);
  };

  const cancelRender = async () => {
    if (!renderJobId) return;
    const response = await fetch(`/api/render/${renderJobId}/cancel`, { method: "POST" });
    if (response.ok) setRenderSnapshot(await response.json());
  };

  const retryRender = async () => {
    if (!renderJobId) return;
    const response = await fetch(`/api/render/${renderJobId}/retry`, { method: "POST" });
    const result = await response.json() as { jobId?: string; snapshot?: import("../../server/render/render-job").RenderJobSnapshot; message?: string };
    if (!response.ok || !result.jobId || !result.snapshot) { setNotice(result.message ?? "导出重试失败"); return; }
    setRenderJobId(result.jobId);
    setRenderSnapshot(result.snapshot);
    void pollRenderJob(result.jobId);
  };

  /** 中文注释：关闭完成提示只清理页面中的任务引用，不会删除已经生成的本地 MP4 文件。 */
  const dismissRenderStatus = () => {
    setRenderJobId(null);
    setRenderSnapshot(null);
  };

  const savePreset = (name: string) => {
    if (!selectedEffectClip) return;
    const preset = createPreset(createId("preset"), selectedEffectClip.templateId, selectedEffectClip.templateVersion, name, selectedEffectClip.params);
    void fetch("/api/workspace/presets", { body: JSON.stringify(preset), headers: { "Content-Type": "application/json" }, method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error("个人预设保存失败");
        const saved = await response.json() as Preset;
        setPresets((current) => [...current, saved]);
        setPresetOpen(false);
      }).catch((error) => setNotice(error instanceof Error ? error.message : "个人预设保存失败"));
  };

  const saveVideoTemplate = (name: string) => {
    const template = createVideoTemplate(createId("video-template"), name, project);
    // 中文注释：模板的源帧率虽对旧 JSON 不可见，但新文件必须显式保存以支持跨帧率套用。
    const persistedTemplate = { ...template, fps: project.settings.fps };
    void fetch("/api/workspace/video-templates", { body: JSON.stringify(persistedTemplate), headers: { "Content-Type": "application/json" }, method: "POST" })
      .then(async (response) => {
        if (!response.ok) throw new Error("视频模板保存失败");
        const saved = await response.json() as VideoTemplate;
        setVideoTemplates((current) => [...current, saved]);
        setVideoTemplateOpen(false);
      }).catch((error) => setNotice(error instanceof Error ? error.message : "视频模板保存失败"));
  };

  /** 中文注释：个人预设删除只移除工作区资产，不改动已经存在的特效片段。 */
  const deletePreset = (preset: Preset) => {
    void fetch(`/api/workspace/presets/${encodeURIComponent(preset.id)}`, { method: "DELETE" })
      .then((response) => { if (!response.ok) throw new Error("个人预设删除失败"); setPresets((current) => current.filter((item) => item.id !== preset.id)); })
      .catch((error) => setNotice(error instanceof Error ? error.message : "个人预设删除失败"));
  };

  /** 中文注释：视频模板删除不会回溯已套用的特效片段，只影响后续复用列表。 */
  const deleteVideoTemplate = (template: VideoTemplate) => {
    void fetch(`/api/workspace/video-templates/${encodeURIComponent(template.id)}`, { method: "DELETE" })
      .then((response) => { if (!response.ok) throw new Error("视频模板删除失败"); setVideoTemplates((current) => current.filter((item) => item.id !== template.id)); })
      .catch((error) => setNotice(error instanceof Error ? error.message : "视频模板删除失败"));
  };

  return (
    <main className="editor-shell">
      <header className="editor-topbar">
        <div className="brand-lockup"><span className="brand-mark">✦</span><div><h1>Frame / Flow</h1><span>本地视频特效编辑器</span></div></div>
          <div className="topbar-actions"><ProjectManager projectId={projectId} projects={projects} onCreate={onCreateProject ?? (() => undefined)} onDelete={onDeleteProject ?? (() => undefined)} onOpen={onOpenProject ?? (() => undefined)} onRename={onRenameProject ?? (() => undefined)} /><button aria-label="撤销" className="icon-button" onClick={undo} type="button">↶</button><button aria-label="重做" className="icon-button" onClick={redo} type="button">↷</button><button aria-label="重置编辑项目" className="icon-button" onClick={() => setResetDialogOpen(true)} title="重置项目" type="button">↺</button><SaveIndicator onRetry={() => void autosave.retry()} state={autosaveState} /><button className="icon-button" disabled={!selectedEffectClip} onClick={() => setPresetOpen(true)} type="button">预设</button><button className="icon-button" onClick={() => setVideoTemplateOpen(true)} type="button">模板</button><button aria-label={missingMediaIds.length > 0 ? "导出视频（存在缺失素材）" : "导出视频"} className="export-button" disabled={missingMediaIds.length > 0} onClick={() => setExportOpen(true)} type="button">导出视频 <span>↗</span></button></div>
        </header>
        {projectError ? <div aria-label="编辑项目错误" className="workspace-error" role="alert"><span>{projectError}</span><button onClick={onRetryProject} type="button">重试</button>{backupAvailable && onRecoverProject ? <button onClick={onRecoverProject} type="button">从最近备份恢复</button> : null}<button onClick={onDismissProjectError} type="button">返回编辑</button></div> : null}
      {notice && <div className="editor-notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice(null)} type="button">×</button></div>}
      <EditorPanelLayout>
        <aside className="left-sidebar panel"><MediaBin mediaAssets={mediaAssets} missingMediaIds={missingMediaIds} onDeleteMedia={deleteMedia} onImportMedia={importMedia} onRelinkMedia={(mediaId, file) => void relinkMedia(mediaId, file)} onRenameMedia={renameMedia} onUndoRelinkMedia={undoRelinkMedia} project={project} relinkedMediaId={relinkedMediaId} /><div className="section-divider" /><TemplateLibrary currentFrame={currentFrame} onAddTemplate={addTemplate} onAddTemplateAtFrame={addTemplateAtFrame} /></aside>
        <PreviewCanvas currentFrame={currentFrame} mediaSources={mediaSources} onChangeParams={commitEffectParams} onFrameChange={seekFrame} onPreviewEnd={() => setPreviewProject(null)} onPreviewParams={previewEffectParams} onSelectClip={selectClip} project={visibleProject} selectedClip={selectedEffectClip} />
        <PropertiesPanel onChangeParams={commitEffectParams} project={visibleProject} selectedClip={selectedEffectClip} />
      </EditorPanelLayout>
      <Timeline currentFrame={currentFrame} onDeleteClip={deleteClip} onDropTemplate={addTemplateAtFrame} onMoveClip={moveClip} onPreviewProject={setPreviewProject} onResizeClip={resizeClip} onSeekFrame={seekFrame} onSelectClip={selectClip} project={project} selectedClipId={selectedClipId} />
      <RenderStatus downloadUrl={renderJobId ? `/api/render/${renderJobId}/download` : undefined} onCancel={() => void cancelRender()} onDismiss={dismissRenderStatus} onRetry={() => void retryRender()} resultUrl={renderJobId ? `/api/render/${renderJobId}/file` : undefined} snapshot={renderSnapshot} />
      <ResetProjectDialog onConfirm={resetProject} onOpenChange={setResetDialogOpen} open={resetDialogOpen} />
      <ExportDialog onClose={() => setExportOpen(false)} onSubmit={submitExport} open={exportOpen} project={project} renderStatus={renderSnapshot?.status} error={renderSnapshot?.error?.message} />
      <PresetDialog onApply={(preset) => { if (selectedEffectClip && !applyPreset(store, preset, selectedEffectClip.id)) setNotice("预设版本与当前模板不兼容，已使用安全默认参数。"); }} onClose={() => setPresetOpen(false)} onDelete={deletePreset} onSave={savePreset} open={presetOpen} presets={presets} templateName={selectedTemplateName} />
      <VideoTemplateDialog effectCount={project.effectClips.length} onApply={(template) => { applyVideoTemplate(store, template, currentFrame); setVideoTemplateOpen(false); }} onClose={() => setVideoTemplateOpen(false)} onDelete={deleteVideoTemplate} onSave={saveVideoTemplate} open={videoTemplateOpen} templates={videoTemplates} />
    </main>
  );
}

function createEditorStoreForPage(): EditorStore {
  return createEditorStore(createEmptyProject());
}

import { createEditorStore } from "../../domain/editor/editor-store";
