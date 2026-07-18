import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorCommand } from "../../domain/editor/commands";
import type { EditorStore } from "../../domain/editor/editor-store";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject, EffectClip, VideoClip } from "../../domain/project/model";
import { applyPreset, createPreset, type Preset } from "../../domain/assets/preset-model";
import { applyVideoTemplate, createVideoTemplate, type VideoTemplate } from "../../domain/assets/video-template-model";
import { getTemplate, getTemplateDefaultParams } from "../../domain/templates/registry";
import type { MediaSources } from "../../remotion/media";
import type { ExportSettings } from "../../domain/project/model";
import { getCompositionDurationInFrames } from "../../remotion/EditorComposition";
import { clampPreviewFrame } from "../preview/PreviewPlayer";
import { createAutosaveController, SaveIndicator, useAutosaveState } from "./SaveIndicator";
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
import "./editor.css";

export type EditorPageProps = {
  store?: EditorStore;
  mediaSources?: MediaSources;
  missingMediaIds?: string[];
  onSaveProject?: (project: EditProject) => Promise<void>;
};

function createId(prefix: string): string {
  const randomUUID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${randomUUID}`;
}

function getClip(project: EditProject, id: string | null): EffectClip | null {
  if (!id) return null;
  return project.effectClips.find((clip) => clip.id === id) ?? null;
}

/** 中文注释：页面层把时间轴事件翻译成 EditorStore 公共命令，组件自身不直接修改项目数组。 */
export function EditorPage({ store: providedStore, mediaSources: initialMediaSources = {}, missingMediaIds: initialMissingMediaIds = [], onSaveProject }: EditorPageProps) {
  const store = useMemo(() => providedStore ?? createEditorStoreForPage(), [providedStore]);
  const autosave = useMemo(() => createAutosaveController(onSaveProject ?? (async () => undefined)), [onSaveProject]);
  const autosaveState = useAutosaveState(autosave);
  const [project, setProject] = useState(store.getSnapshot());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [mediaSources, setMediaSources] = useState<MediaSources>(initialMediaSources);
  const [missingMediaIds, setMissingMediaIds] = useState(initialMissingMediaIds);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [renderSnapshot, setRenderSnapshot] = useState<import("../../server/render/render-job").RenderJobSnapshot | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [videoTemplateOpen, setVideoTemplateOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [videoTemplates, setVideoTemplates] = useState<VideoTemplate[]>([]);
  // 中文注释：只记录最近一次重置前的播放头，以便紧接着撤销重置时恢复用户正在查看的位置。
  const frameBeforeProjectReset = useRef<number | null>(null);

  useEffect(() => store.subscribe((snapshot) => {
    setProject(snapshot);
    autosave.schedule(snapshot);
  }), [autosave, store]);

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

  const selectedEffectClip = getClip(project, selectedClipId);
  const selectedTemplateName = selectedEffectClip ? getTemplate(selectedEffectClip.templateId, selectedEffectClip.templateVersion).name : undefined;

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
      const clip: VideoClip = {
        id: createId("video"),
        mediaId: asset.id,
        fromFrame: lastFrame,
        sourceStartFrame: 0,
        durationInFrames: project.settings.fps * 5,
        audioEnabled: true,
      };
      // 中文注释：预览也使用工作区稳定地址，关闭页面后项目仍可由素材 ID 恢复。
      setMediaSources((current) => ({ ...current, [asset.id]: `/api/workspace/media/${encodeURIComponent(asset.id)}` }));
      setMissingMediaIds((current) => current.filter((mediaId) => mediaId !== asset.id));
      // 中文注释：素材原始尺寸随首次导入命令传入，由领域层安全决定是否匹配横屏编辑项目。
      dispatch({ type: "add-video-clip", clip, sourceDimensions: { width: asset.width, height: asset.height } });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "视频素材导入失败");
    }
  };

  const selectClip = (clipId: string) => setSelectedClipId(clipId);

  const seekFrame = (frame: number) => {
    setCurrentFrame(clampPreviewFrame(frame, getCompositionDurationInFrames(project)));
  };

  const resetProject = () => {
    // 中文注释：项目快照通过 Store 重置并进入撤销历史；页面级临时选区和播放状态同步归零。
    frameBeforeProjectReset.current = currentFrame;
    dispatch({ type: "reset-project" });
    setCurrentFrame(0);
    setSelectedClipId(null);
    setRenderSnapshot(null);
  };

  const undo = () => {
    const frame = frameBeforeProjectReset.current;
    store.undo();
    if (frame === null) return;
    // 中文注释：撤销重置后按已恢复的项目时长校正播放头，继续保持时间轴与 Remotion Player 同步。
    setCurrentFrame(clampPreviewFrame(frame, getCompositionDurationInFrames(store.getSnapshot())));
    frameBeforeProjectReset.current = null;
  };

  const moveClip = (clipId: string, kind: ClipKind, fromFrame: number) => {
    dispatch(kind === "video" ? { type: "move-video-clip", clipId, fromFrame } : { type: "move-effect-clip", clipId, fromFrame });
  };

  const resizeClip = (clipId: string, kind: ClipKind, fromFrame: number, durationInFrames: number) => {
    const sourceClip = kind === "video" ? project.videoClips.find((clip) => clip.id === clipId) : project.effectClips.find((clip) => clip.id === clipId);
    if (!sourceClip) return;
    const nextClip = { ...sourceClip, fromFrame: Math.max(0, fromFrame), durationInFrames: Math.max(1, durationInFrames) };
    // 中文注释：当前领域命令已覆盖增删，裁剪通过删除旧快照再添加新快照完成，仍由 Store 校验并进入历史。
    dispatch(kind === "video" ? { type: "delete-video-clip", clipId } : { type: "delete-effect-clip", clipId });
    dispatch(kind === "video" ? { type: "add-video-clip", clip: nextClip as VideoClip } : { type: "add-effect-clip", clip: nextClip as EffectClip });
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
    const response = await fetch("/api/render", {
      body: JSON.stringify({ project: { ...project, export: settings }, outputPath: "workspace/renders/latest.mp4", mediaSources }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const initial = await response.json() as { jobId: string; snapshot: import("../../server/render/render-job").RenderJobSnapshot };
    setRenderSnapshot(initial.snapshot);
    const poll = async () => {
      const statusResponse = await fetch(`/api/render/${initial.jobId}`);
      const snapshot = await statusResponse.json() as import("../../server/render/render-job").RenderJobSnapshot;
      setRenderSnapshot(snapshot);
      if (snapshot.status === "preparing" || snapshot.status === "rendering") window.setTimeout(poll, 250);
    };
    void poll();
  };

  const savePreset = (name: string) => {
    if (!selectedEffectClip) return;
    const preset = createPreset(createId("preset"), selectedEffectClip.templateId, selectedEffectClip.templateVersion, name, selectedEffectClip.params);
    setPresets((current) => [...current, preset]);
    setPresetOpen(false);
  };

  const saveVideoTemplate = (name: string) => {
    const template = createVideoTemplate(createId("video-template"), name, project);
    setVideoTemplates((current) => [...current, template]);
    setVideoTemplateOpen(false);
  };

  return (
    <main className="editor-shell">
      <header className="editor-topbar">
        <div className="brand-lockup"><span className="brand-mark">✦</span><div><h1>Frame / Flow</h1><span>本地视频特效编辑器</span></div></div>
        <div className="topbar-actions"><button aria-label="撤销" className="icon-button" onClick={undo} type="button">↶</button><button aria-label="重做" className="icon-button" onClick={() => store.redo()} type="button">↷</button><button aria-label="重置编辑项目" className="icon-button" onClick={() => setResetDialogOpen(true)} title="重置项目" type="button">↺</button><SaveIndicator state={autosaveState} /><button className="icon-button" disabled={!selectedEffectClip} onClick={() => setPresetOpen(true)} type="button">预设</button><button className="icon-button" onClick={() => setVideoTemplateOpen(true)} type="button">模板</button><button aria-label={missingMediaIds.length > 0 ? "导出视频（存在缺失素材）" : "导出视频"} className="export-button" disabled={missingMediaIds.length > 0} onClick={() => setExportOpen(true)} type="button">导出视频 <span>↗</span></button></div>
      </header>
      {notice && <div className="editor-notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice(null)} type="button">×</button></div>}
      <div className="editor-main-grid">
        <aside className="left-sidebar panel"><MediaBin missingMediaIds={missingMediaIds} onImportMedia={importMedia} project={project} /><div className="section-divider" /><TemplateLibrary currentFrame={currentFrame} onAddTemplate={addTemplate} onAddTemplateAtFrame={addTemplateAtFrame} /></aside>
        <PreviewCanvas currentFrame={currentFrame} mediaSources={mediaSources} onChangeParams={(clipId, params) => dispatch({ type: "update-effect-params", clipId, params })} onFrameChange={seekFrame} project={project} selectedClip={selectedEffectClip} />
        <PropertiesPanel onChangeParams={(clipId, params) => dispatch({ type: "update-effect-params", clipId, params })} project={project} selectedClip={selectedEffectClip} />
      </div>
      <Timeline currentFrame={currentFrame} onDeleteClip={deleteClip} onDropTemplate={addTemplateAtFrame} onMoveClip={moveClip} onResizeClip={resizeClip} onSeekFrame={seekFrame} onSelectClip={selectClip} project={project} selectedClipId={selectedClipId} />
      <RenderStatus onCancel={() => undefined} snapshot={renderSnapshot} />
      <ResetProjectDialog onConfirm={resetProject} onOpenChange={setResetDialogOpen} open={resetDialogOpen} />
      <ExportDialog onClose={() => setExportOpen(false)} onSubmit={submitExport} open={exportOpen} project={project} renderStatus={renderSnapshot?.status} error={renderSnapshot?.error?.message} />
      <PresetDialog onApply={(preset) => { if (selectedEffectClip) applyPreset(store, preset, selectedEffectClip.id); }} onClose={() => setPresetOpen(false)} onSave={savePreset} open={presetOpen} presets={presets} templateName={selectedTemplateName} />
      <VideoTemplateDialog effectCount={project.effectClips.length} onApply={(template) => { applyVideoTemplate(store, template, currentFrame); setVideoTemplateOpen(false); }} onClose={() => setVideoTemplateOpen(false)} onSave={saveVideoTemplate} open={videoTemplateOpen} template={videoTemplates.at(-1)} />
    </main>
  );
}

function createEditorStoreForPage(): EditorStore {
  return createEditorStore(createEmptyProject());
}

import { createEditorStore } from "../../domain/editor/editor-store";
