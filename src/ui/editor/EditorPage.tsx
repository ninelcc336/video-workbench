import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorCommand } from "../../domain/editor/commands";
import type { EditorStore } from "../../domain/editor/editor-store";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject, EffectClip, VideoClip } from "../../domain/project/model";
import { getTemplate } from "../../domain/templates/registry";
import type { MediaSources } from "../../remotion/media";
import type { MediaAsset } from "../../server/workspace/media-repository";
import type { ExportSettings } from "../../domain/project/model";
import { getCompositionDurationInFrames } from "../../remotion/EditorComposition";
import { clampPreviewFrame } from "../preview/PreviewPlayer";
import { findNearestLegalVideoStart } from "../../domain/editor/clip-ranges";
import { createAutosaveController, SaveIndicator, type AutosaveStatus, useAutosaveState } from "./SaveIndicator";
import { ExportDialog } from "./ExportDialog";
import { PresetDialog } from "./PresetDialog";
import { ResetProjectDialog } from "./ResetProjectDialog";
import { RenderStatus } from "./RenderStatus";
import { VideoTemplateDialog } from "./VideoTemplateDialog";
import { MediaBin } from "./MediaBin";
import { PreviewCanvas } from "./PreviewCanvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { TemplateLibrary } from "./TemplateLibrary";
import { Timeline, type ClipKind } from "./Timeline";
import {
  createEffectClipFromTemplate,
  findTemplateTransitionBoundary,
  type TemplateTransitionBoundary,
} from "./drag-and-drop";
import { importMediaFile, readVideoDimensions } from "./media-import";
import { getAvailableEffectTrackId } from "./effect-track-layout";
import { EditorPanelLayout } from "./EditorPanelLayout";
import { ProjectManager, type WorkspaceSummary } from "./ProjectManager";
import { ThemeSelector } from "../theme/ThemeProvider";
import { applyPreset, type Preset } from "../../domain/assets/preset-model";
import { applyVideoTemplate, createVideoTemplate, type VideoTemplate } from "../../domain/assets/video-template-model";
import "./editor.css";

export type EditorPageProps = {
  store?: EditorStore;
  mediaSources?: MediaSources;
  missingMediaIds?: string[];
  onSaveProject?: (project: EditProject) => Promise<void>;
  projectId?: string;
  projects?: WorkspaceSummary[];
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
  /** 中文注释：新工作区接口使用 workspaceId；保留 projectId 仅用于旧组件测试的过渡兼容。 */
  workspaceId?: string;
  workspaces?: WorkspaceSummary[];
  onOpenWorkspace?: (workspaceId: string) => void;
  onCreateWorkspace?: (workspaceId: string) => void;
  onRenameWorkspace?: (workspaceId: string, nextWorkspaceId: string) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
};

function createId(prefix: string): string {
  const randomUUID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${randomUUID}`;
}

/**
 * 中文注释：统一构造页面命令写入的特效片段，合并族身份、默认参数和可用轨道；
 * 普通范围放置不额外写 placement，只有真实转场保存相邻视频片段绑定。
 */
function createEditorEffectClip(
  project: EditProject,
  template: ReturnType<typeof getTemplate>,
  fromFrame: number,
  placement?: EffectClip["placement"],
): EffectClip {
  const safeFromFrame = Number.isFinite(fromFrame) ? Math.max(0, Math.round(fromFrame)) : 0;
  return createEffectClipFromTemplate(template, safeFromFrame, {
    ...(placement ? { placement } : {}),
    trackId: getAvailableEffectTrackId(project.effectClips, safeFromFrame, template.defaultDurationInFrames),
  });
}

function getClip(project: EditProject, id: string | null): EffectClip | null {
  if (!id) return null;
  return project.effectClips.find((clip) => clip.id === id) ?? null;
}

/** 中文注释：旧特效模板可能已经从注册表移除，资产入口仍应能打开并显示安全回退名称。 */
function getEffectTemplateName(clip: EffectClip | null): string {
  if (!clip) return "当前特效";
  try {
    return getTemplate(clip.templateId, clip.templateVersion).name;
  } catch {
    return "当前特效";
  }
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
export function EditorPage({ store: providedStore, mediaSources: initialMediaSources = {}, missingMediaIds: initialMissingMediaIds = [], onSaveProject, projectId = "", projects = [], onOpenProject, onCreateProject, onRenameProject, onDeleteProject, workspaceId, workspaces, onOpenWorkspace, onCreateWorkspace, onRenameWorkspace, onDeleteWorkspace, projectError = null, onRetryProject, onDismissProjectError, onAutosaveStatusChange, backupAvailable = false, onRecoverProject }: EditorPageProps) {
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
  const [presetOpen, setPresetOpen] = useState(false);
  const [videoTemplateOpen, setVideoTemplateOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [videoTemplates, setVideoTemplates] = useState<VideoTemplate[]>([]);
  const [presetError, setPresetError] = useState<string | undefined>();
  const [videoTemplateError, setVideoTemplateError] = useState<string | undefined>();
  const [renderSnapshot, setRenderSnapshot] = useState<import("../../server/render/render-job").RenderJobSnapshot | null>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [relinkedMediaId, setRelinkedMediaId] = useState<string | null>(null);
  const activeWorkspaceId = workspaceId ?? projectId;
  const workspaceApi = `/api/workspaces/${encodeURIComponent(activeWorkspaceId)}`;
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
    // 中文注释：工作区切换会生成新 Store；React 的 useState 不会因参数变化自动重置，必须显式替换时间轴快照和所有仅属于旧工作区的临时状态。
    setProject(store.getSnapshot());
    setMediaSources(initialMediaSources);
    setMissingMediaIds(initialMissingMediaIds);
    setPreviewProject(null);
    setSelectedClipId(null);
    setCurrentFrame(0);
    setMediaAssets([]);
    setRelinkedMediaId(null);
    setRenderSnapshot(null);
    setRenderJobId(null);
    setNotice(null);
    setPresets([]);
    setVideoTemplates([]);
    setPresetError(undefined);
    setVideoTemplateError(undefined);
  }, [store]);

  useEffect(() => () => {
    // 中文注释：关闭工作区或切换工作区前尽量冲刷待保存快照，避免防抖窗口内的编辑丢失。
    void autosave.flush();
  }, [autosave]);

  useEffect(() => {
    // 中文注释：个人资产在工作区恢复后重新加载，页面内存不再是唯一来源。
    void fetch(`${workspaceApi}/media`).then((response) => response.ok ? response.json() : [])
      .then((loadedMedia) => setMediaAssets(loadedMedia as MediaAsset[]))
      .catch(() => undefined);
  }, [store, workspaceApi]);

  useEffect(() => {
    // 中文注释：个人预设和视频模板均属于当前视频工作区，切换工作区时必须重新获取，不能复用上一个工作区的资产列表。
    void Promise.all([
      fetch(`${workspaceApi}/presets`).then((response) => response.ok ? response.json() : []),
      fetch(`${workspaceApi}/video-templates`).then((response) => response.ok ? response.json() : []),
    ]).then(([loadedPresets, loadedVideoTemplates]) => {
      // 中文注释：接口异常或旧服务返回非数组时安全展示空资产库，避免一个加载响应破坏整个编辑器页面。
      setPresets(Array.isArray(loadedPresets) ? loadedPresets as Preset[] : []);
      setVideoTemplates(Array.isArray(loadedVideoTemplates) ? loadedVideoTemplates as VideoTemplate[] : []);
    }).catch(() => {
      // 中文注释：资产库加载失败不阻塞视频工作区编辑；用户打开相应对话框后仍会收到后续操作的明确反馈。
    });
  }, [store, workspaceApi]);

  useEffect(() => {
    // 中文注释：工作区时间轴时长变化后同步收紧播放头，避免 Player 访问末尾之外的帧。
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
  const selectedStoredEffectClip = getClip(project, selectedClipId);
  const transitionBoundary = findTemplateTransitionBoundary(project, currentFrame);

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

  /** 中文注释：播放头添加接收可选起始样式，保证族内样式选择不会退回第一个默认样式。 */
  const addTemplate = (templateId: string, startingStyleId?: string) => {
    const template = startingStyleId
      ? getTemplate(templateId, undefined, startingStyleId)
      : getTemplate(templateId);
    const clip = createEditorEffectClip(project, template, currentFrame);
    dispatch({ type: "add-effect-clip", clip });
    setSelectedClipId(clip.id);
  };

  /** 中文注释：播放头之外的添加入口复用同一片段构造规则，只改变特效的起始帧。 */
  const addTemplateAtFrame = (template: ReturnType<typeof getTemplate>, frame: number) => {
    const clip = createEditorEffectClip(project, template, frame);
    dispatch({ type: "add-effect-clip", clip });
    setSelectedClipId(clip.id);
  };

  /** 中文注释：真实转场只保存合法相邻视频片段身份和交界帧，绝不退回普通范围放置；双画面渲染由后续转场合成器消费该声明。 */
  const addTransitionAtBoundary = (
    template: ReturnType<typeof getTemplate>,
    boundary: TemplateTransitionBoundary,
  ) => {
    const clip = createEditorEffectClip(project, template, boundary.frame, {
      type: "boundary",
      beforeVideoClipId: boundary.beforeVideoClipId,
      afterVideoClipId: boundary.afterVideoClipId,
    });
    dispatch({ type: "add-effect-clip", clip });
    setSelectedClipId(clip.id);
  };

  /** 中文注释：素材库与导入完成后共用同一上轨命令，确保删掉时间轴片段后仍可从素材库重新添加。 */
  const addMediaToTimeline = (asset: MediaAsset) => {
    const lastFrame = Math.max(0, ...project.videoClips.map((clip) => clip.fromFrame + clip.durationInFrames));
    const clipFps = project.videoClips.length === 0 && asset.fps ? Math.max(1, Math.round(asset.fps)) : project.settings.fps;
    const clip: VideoClip = {
      id: createId("video"),
      mediaId: asset.id,
      fromFrame: lastFrame,
      sourceStartFrame: 0,
      // 中文注释：历史素材缺少元数据时保留 5 秒兼容时长，避免阻断重新上轨。
      durationInFrames: Math.max(1, Math.round((asset.durationInSeconds ?? 5) * clipFps)),
      audioEnabled: true,
    };
    const sourceDimensions = asset.width && asset.height
      ? { width: asset.width, height: asset.height, fps: asset.fps }
      : undefined;
    // 中文注释：首次从素材库上轨的素材此前没有预览地址，因此在同一交互中补齐稳定工作区 URL。
    setMediaSources((current) => ({ ...current, [asset.id]: `${workspaceApi}/media/${encodeURIComponent(asset.id)}` }));
    dispatch({ type: "add-video-clip", clip, sourceDimensions });
    setSelectedClipId(clip.id);
  };

  const importMedia = async (file: File) => {
    try {
      const asset = await importMediaFile(file, fetch, readVideoDimensions, `${workspaceApi}/media`);
      setMediaAssets((current) => [...current.filter((item) => item.id !== asset.id), asset]);
      setMissingMediaIds((current) => current.filter((mediaId) => mediaId !== asset.id));
      if (asset.fpsWasFallback) setNotice("无法读取素材帧率，已按 30fps 导入。");
      addMediaToTimeline(asset);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "视频素材导入失败");
    }
  };

  /** 中文注释：重新关联沿用稳定媒体 ID，只更新素材文件和预览地址，不改项目画布或特效布局。 */
  const relinkMedia = async (mediaId: string, file: File) => {
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const response = await fetch(`${workspaceApi}/media/${encodeURIComponent(mediaId)}/relink`, { body: form, method: "POST" });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "重新关联素材失败");
      const asset = await response.json() as MediaAsset;
      setMediaAssets((current) => [...current.filter((item) => item.id !== mediaId), asset]);
      setMediaSources((current) => ({ ...current, [mediaId]: `${workspaceApi}/media/${encodeURIComponent(mediaId)}` }));
      setMissingMediaIds((current) => current.filter((id) => id !== mediaId));
      setRelinkedMediaId(mediaId);
      setNotice("素材已重新关联，原有时间轴和特效布局保持不变。");
    } catch (error) {
      const message = error instanceof Error ? error.message : "重新关联素材失败";
      setNotice(message);
      throw new Error(message);
    }
  };

  /** 中文注释：素材重命名只更新展示名，项目快照继续使用稳定 mediaId。 */
  const renameMedia = async (mediaId: string, name: string) => {
    try {
      const response = await fetch(`${workspaceApi}/media/${encodeURIComponent(mediaId)}`, { body: JSON.stringify({ name }), headers: { "Content-Type": "application/json" }, method: "PATCH" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "素材重命名失败");
      }
      const asset = await response.json() as MediaAsset;
      setMediaAssets((current) => current.map((item) => item.id === mediaId ? asset : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : "素材重命名失败";
      setNotice(message);
      throw new Error(message);
    }
  };

  /** 中文注释：删除操作只检查当前工作区时间轴引用，其他工作区无法共享该素材。 */
  const deleteMedia = async (mediaId: string) => {
    try {
      const response = await fetch(`${workspaceApi}/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "素材删除失败");
      }
      setMediaAssets((current) => current.filter((item) => item.id !== mediaId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "素材删除失败";
      setNotice(message);
      throw new Error(message);
    }
  };

  /** 中文注释：撤销重新关联恢复服务端保存的上一份素材，并重新标记预览资源。 */
  const undoRelinkMedia = (mediaId: string) => {
    void fetch(`${workspaceApi}/media/${encodeURIComponent(mediaId)}/relink/undo`, { method: "POST" })
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
      setNotice("当前工作区存在缺失素材，修复后才能导出视频。");
      return;
    }
    setExportOpen(false);
    try {
      const response = await fetch("/api/render", {
        body: JSON.stringify({ project: { ...project, export: settings }, outputPath: "export.mp4", mediaSources, workspaceId: activeWorkspaceId }),
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

  /** 中文注释：保存个人预设只发送当前选中特效的稳定项目快照，临时过程预览不写入资产库。 */
  const savePreset = async (name: string) => {
    if (!selectedStoredEffectClip) {
      setPresetError("请先在时间轴或过程预览中选择一个特效片段。");
      return;
    }
    try {
      const response = await fetch(`${workspaceApi}/presets`, {
        body: JSON.stringify({
          name,
          params: selectedStoredEffectClip.params,
          templateId: selectedStoredEffectClip.templateId,
          templateVersion: selectedStoredEffectClip.templateVersion,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await response.json().catch(() => null) as Preset | { message?: string } | null;
      if (!response.ok || !body || !("id" in body)) throw new Error((body && "message" in body ? body.message : undefined) ?? "个人预设保存失败");
      setPresets((current) => [...current, body]);
      setPresetOpen(false);
      setPresetError(undefined);
      setNotice(`已保存个人预设“${body.name}”。`);
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : "个人预设保存失败");
    }
  };

  /** 中文注释：套用仍由领域层校验模板兼容性；不兼容旧预设会安全回退，并将结果明确告知创作者。 */
  const applySelectedPreset = (preset: Preset) => {
    if (!selectedStoredEffectClip) {
      setPresetError("请先选择一个要套用个人预设的特效片段。");
      return;
    }
    try {
      const compatible = applyPreset(store, preset, selectedStoredEffectClip.id);
      setNotice(compatible ? `已将“${preset.name}”套用到当前特效片段。` : `“${preset.name}”与当前特效不兼容，已应用安全默认参数。`);
      setPresetError(undefined);
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : "个人预设套用失败");
    }
  };

  /** 中文注释：删除个人预设只影响资产库列表，已保存的工作区快照和已套用片段参数保持不变。 */
  const deletePreset = async (preset: Preset) => {
    try {
      const response = await fetch(`${workspaceApi}/presets/${encodeURIComponent(preset.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "个人预设删除失败");
      setPresets((current) => current.filter((item) => item.id !== preset.id));
      setNotice(`已删除个人预设“${preset.name}”。`);
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : "个人预设删除失败");
    }
  };

  /** 中文注释：视频模板从当前项目的特效片段生成相对布局，视频素材和其时间轴片段不会写入模板。 */
  const saveVideoTemplate = async (name: string) => {
    try {
      const template = createVideoTemplate(createId("video-template"), name, project);
      const response = await fetch(`${workspaceApi}/video-templates`, {
        body: JSON.stringify(template),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await response.json().catch(() => null) as VideoTemplate | { message?: string } | null;
      if (!response.ok || !body || !("id" in body)) throw new Error((body && "message" in body ? body.message : undefined) ?? "视频模板保存失败");
      setVideoTemplates((current) => [...current, body]);
      setVideoTemplateOpen(false);
      setVideoTemplateError(undefined);
      setNotice(`已保存视频模板“${body.name}”。`);
    } catch (error) {
      setVideoTemplateError(error instanceof Error ? error.message : "视频模板保存失败");
    }
  };

  /** 中文注释：套用视频模板在播放头位置新增一组特效片段；领域命令保证它可作为单次编辑撤销。 */
  const applySelectedVideoTemplate = (template: VideoTemplate) => {
    try {
      applyVideoTemplate(store, template, currentFrame, (index) => createId(`effect-template-${index}`));
      setNotice(`已在播放头位置新增“${template.name}”的 ${template.effectClips.length} 个特效片段。`);
      setVideoTemplateError(undefined);
    } catch (error) {
      setVideoTemplateError(error instanceof Error ? error.message : "视频模板套用失败");
    }
  };

  /** 中文注释：删除视频模板只移除可复用布局资产，当前时间轴上已经新增的特效片段不会被反向修改。 */
  const deleteVideoTemplate = async (template: VideoTemplate) => {
    try {
      const response = await fetch(`${workspaceApi}/video-templates/${encodeURIComponent(template.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? "视频模板删除失败");
      setVideoTemplates((current) => current.filter((item) => item.id !== template.id));
      setNotice(`已删除视频模板“${template.name}”。`);
    } catch (error) {
      setVideoTemplateError(error instanceof Error ? error.message : "视频模板删除失败");
    }
  };

  return (
    <main className="editor-shell">
      <header className="editor-topbar">
        {/* 中文注释：品牌与工作区归为同一左侧区域，始终优先保留工作区切换和管理入口。 */}
        <div className="topbar-workspace">
          <div className="brand-lockup"><span className="brand-mark">✦</span><div><h1>Frame / Flow</h1><span>本地视频特效编辑器</span></div></div>
          <ProjectManager workspaceId={activeWorkspaceId} workspaces={workspaces ?? projects} onCreate={onCreateWorkspace ?? onCreateProject ?? (() => undefined)} onDelete={onDeleteWorkspace ?? onDeleteProject ?? (() => undefined)} onOpen={onOpenWorkspace ?? onOpenProject ?? (() => undefined)} onRename={onRenameWorkspace ?? onRenameProject ?? (() => undefined)} />
        </div>
        {/* 中文注释：中部编辑操作在窄屏下可横向滚动，避免压缩按钮宽度或使文案折行。 */}
        <div aria-label="编辑操作" className="topbar-actions" role="toolbar"><button className="asset-trigger" onClick={() => { setPresetError(selectedStoredEffectClip ? undefined : "请先选择一个特效片段，再保存或套用个人预设。"); setPresetOpen(true); }} type="button">个人预设</button><button className="asset-trigger" onClick={() => { setVideoTemplateError(undefined); setVideoTemplateOpen(true); }} type="button">视频模板</button><button aria-label="撤销" className="icon-button" onClick={undo} type="button">↶</button><button aria-label="重做" className="icon-button" onClick={redo} type="button">↷</button><button aria-label="重置视频工作区" className="icon-button" onClick={() => setResetDialogOpen(true)} title="重置工作区" type="button">↺</button><SaveIndicator onRetry={() => void autosave.retry()} state={autosaveState} /><button aria-label={missingMediaIds.length > 0 ? "导出视频（存在缺失素材）" : "导出视频"} className="export-button" disabled={missingMediaIds.length > 0} onClick={() => setExportOpen(true)} ref={exportTriggerRef} type="button">导出视频 <span>↗</span></button></div>
        {/* 中文注释：主题属于全局外观设置，独立放在顶栏最右端，不参与编辑操作区的压缩。 */}
        <div className="topbar-theme"><ThemeSelector /></div>
        </header>
        {projectError ? <div aria-label="视频工作区错误" className="workspace-error" role="alert"><span>{projectError}</span><button onClick={onRetryProject} type="button">重试</button>{backupAvailable && onRecoverProject ? <button onClick={onRecoverProject} type="button">从最近备份恢复</button> : null}<button onClick={onDismissProjectError} type="button">返回编辑</button></div> : null}
      {notice && <div className="editor-notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice(null)} type="button">×</button></div>}
      <EditorPanelLayout>
        <aside className="left-sidebar panel"><MediaBin mediaAssets={mediaAssets} missingMediaIds={missingMediaIds} onAddMedia={addMediaToTimeline} onDeleteMedia={deleteMedia} onImportMedia={importMedia} onRelinkMedia={(mediaId, file) => void relinkMedia(mediaId, file)} onRenameMedia={renameMedia} onUndoRelinkMedia={undoRelinkMedia} project={project} relinkedMediaId={relinkedMediaId} /><div className="section-divider" /><TemplateLibrary currentFrame={currentFrame} onAddTemplate={addTemplate} onAddTemplateAtFrame={addTemplateAtFrame} onAddTransitionAtBoundary={addTransitionAtBoundary} onInvalidTransition={() => setNotice("片段转场只能放在相邻视频片段交界点。") } onOpenPresets={() => { setPresetError(selectedStoredEffectClip ? undefined : "请先选择一个特效片段，再保存或套用个人预设。"); setPresetOpen(true); }} selectedEffectFamilyId={selectedEffectClip?.effectFamilyId ?? selectedEffectClip?.templateId ?? null} transitionBoundary={transitionBoundary} /></aside>
        <PreviewCanvas currentFrame={currentFrame} mediaSources={mediaSources} onChangeParams={commitEffectParams} onFrameChange={seekFrame} onPreviewEnd={() => setPreviewProject(null)} onPreviewParams={previewEffectParams} onSelectClip={selectClip} project={visibleProject} selectedClip={selectedEffectClip} />
        <PropertiesPanel onChangeParams={commitEffectParams} onPreviewParams={previewEffectParams} project={visibleProject} selectedClip={selectedEffectClip} />
      </EditorPanelLayout>
      <Timeline currentFrame={currentFrame} onDeleteClip={deleteClip} onDropTemplate={addTemplateAtFrame} onDropTransition={addTransitionAtBoundary} onInvalidTemplateDrop={setNotice} onMoveClip={moveClip} onPreviewProject={setPreviewProject} onResizeClip={resizeClip} onSeekFrame={seekFrame} onSelectClip={selectClip} project={project} selectedClipId={selectedClipId} />
      <RenderStatus onCancel={() => void cancelRender()} onDismiss={dismissRenderStatus} onRetry={() => void retryRender()} resultUrl={renderJobId ? `/api/render/${renderJobId}/file` : undefined} snapshot={renderSnapshot} />
      <ResetProjectDialog onConfirm={resetProject} onOpenChange={setResetDialogOpen} open={resetDialogOpen} />
      <ExportDialog onClose={() => setExportOpen(false)} onSubmit={submitExport} open={exportOpen} project={project} returnFocusRef={exportTriggerRef} />
      <PresetDialog canApply={Boolean(selectedStoredEffectClip)} canSave={Boolean(selectedStoredEffectClip)} error={presetError} onApply={applySelectedPreset} onClose={() => { setPresetOpen(false); setPresetError(undefined); }} onDelete={deletePreset} onSave={savePreset} open={presetOpen} presets={presets} templateName={getEffectTemplateName(selectedStoredEffectClip)} />
      <VideoTemplateDialog effectCount={project.effectClips.length} error={videoTemplateError} onApply={applySelectedVideoTemplate} onClose={() => { setVideoTemplateOpen(false); setVideoTemplateError(undefined); }} onDelete={deleteVideoTemplate} onSave={saveVideoTemplate} open={videoTemplateOpen} templates={videoTemplates} />
    </main>
  );
}

function createEditorStoreForPage(): EditorStore {
  return createEditorStore(createEmptyProject());
}

import { createEditorStore } from "../../domain/editor/editor-store";
