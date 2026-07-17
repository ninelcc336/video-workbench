import { useEffect, useMemo, useState } from "react";
import type { EditorCommand } from "../../domain/editor/commands";
import type { EditorStore } from "../../domain/editor/editor-store";
import { createEmptyProject } from "../../domain/project/factories";
import type { EditProject, EffectClip, VideoClip } from "../../domain/project/model";
import { getTemplate, getTemplateDefaultParams } from "../../domain/templates/registry";
import type { MediaSources } from "../../remotion/media";
import type { ExportSettings } from "../../domain/project/model";
import { createAutosaveController, SaveIndicator, useAutosaveState } from "./SaveIndicator";
import { ExportDialog } from "./ExportDialog";
import { RenderStatus } from "./RenderStatus";
import { MediaBin } from "./MediaBin";
import { PreviewCanvas } from "./PreviewCanvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { TemplateLibrary } from "./TemplateLibrary";
import { Timeline, type ClipKind } from "./Timeline";
import "./editor.css";

export type EditorPageProps = {
  store?: EditorStore;
  mediaSources?: MediaSources;
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
export function EditorPage({ store: providedStore, mediaSources: initialMediaSources = {}, onSaveProject }: EditorPageProps) {
  const store = useMemo(() => providedStore ?? createEditorStoreForPage(), [providedStore]);
  const autosave = useMemo(() => createAutosaveController(onSaveProject ?? (async () => undefined)), [onSaveProject]);
  const autosaveState = useAutosaveState(autosave);
  const [project, setProject] = useState(store.getSnapshot());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [mediaSources, setMediaSources] = useState<MediaSources>(initialMediaSources);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [renderSnapshot, setRenderSnapshot] = useState<import("../../server/render/render-job").RenderJobSnapshot | null>(null);

  useEffect(() => store.subscribe((snapshot) => {
    setProject(snapshot);
    autosave.schedule(snapshot);
  }), [autosave, store]);

  const dispatch = (command: EditorCommand) => {
    try {
      store.dispatch(command);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败，请检查时间轴范围");
    }
  };

  const selectedEffectClip = getClip(project, selectedClipId);

  const addTemplate = (templateId: string) => {
    const template = getTemplate(templateId);
    const clip: EffectClip = {
      id: createId("effect"),
      templateId: template.id,
      templateVersion: template.version,
      trackId: "effects-1",
      fromFrame: currentFrame,
      durationInFrames: template.defaultDurationInFrames,
      params: getTemplateDefaultParams(template),
    };
    dispatch({ type: "add-effect-clip", clip });
    setSelectedClipId(clip.id);
  };

  const addTemplateAtFrame = (template: ReturnType<typeof getTemplate>, frame: number) => {
    const clip: EffectClip = {
      id: createId("effect"),
      templateId: template.id,
      templateVersion: template.version,
      trackId: "effects-1",
      fromFrame: Math.max(0, Math.round(frame)),
      durationInFrames: template.defaultDurationInFrames,
      params: getTemplateDefaultParams(template),
    };
    dispatch({ type: "add-effect-clip", clip });
    setSelectedClipId(clip.id);
  };

  const importMedia = (file: File) => {
    const mediaId = createId("media");
    const src = URL.createObjectURL(file);
    const lastFrame = Math.max(0, ...project.videoClips.map((clip) => clip.fromFrame + clip.durationInFrames));
    const clip: VideoClip = {
      id: createId("video"),
      mediaId,
      fromFrame: lastFrame,
      sourceStartFrame: 0,
      durationInFrames: project.settings.fps * 5,
      audioEnabled: true,
    };
    setMediaSources((current) => ({ ...current, [mediaId]: src }));
    dispatch({ type: "add-video-clip", clip });
  };

  const selectClip = (clipId: string) => setSelectedClipId(clipId);

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

  return (
    <main className="editor-shell">
      <header className="editor-topbar">
        <div className="brand-lockup"><span className="brand-mark">✦</span><div><h1>Frame / Flow</h1><span>本地视频特效编辑器</span></div></div>
        <div className="topbar-actions"><button aria-label="撤销" className="icon-button" onClick={() => store.undo()} type="button">↶</button><button aria-label="重做" className="icon-button" onClick={() => store.redo()} type="button">↷</button><SaveIndicator state={autosaveState} /><button className="export-button" onClick={() => setExportOpen(true)} type="button">导出视频 <span>↗</span></button></div>
      </header>
      {notice && <div className="editor-notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice(null)} type="button">×</button></div>}
      <div className="editor-main-grid">
        <aside className="left-sidebar panel"><MediaBin onImportMedia={importMedia} project={project} /><div className="section-divider" /><TemplateLibrary currentFrame={currentFrame} onAddTemplate={addTemplate} onAddTemplateAtFrame={addTemplateAtFrame} /></aside>
        <PreviewCanvas currentFrame={currentFrame} mediaSources={mediaSources} onChangeParams={(clipId, params) => dispatch({ type: "update-effect-params", clipId, params })} project={project} selectedClip={selectedEffectClip} />
        <PropertiesPanel onChangeParams={(clipId, params) => dispatch({ type: "update-effect-params", clipId, params })} project={project} selectedClip={selectedEffectClip} />
      </div>
      <Timeline currentFrame={currentFrame} onDeleteClip={deleteClip} onMoveClip={moveClip} onResizeClip={resizeClip} onSeekFrame={setCurrentFrame} onSelectClip={selectClip} project={project} selectedClipId={selectedClipId} />
      <RenderStatus onCancel={() => undefined} snapshot={renderSnapshot} />
      <ExportDialog onClose={() => setExportOpen(false)} onSubmit={submitExport} open={exportOpen} project={project} renderStatus={renderSnapshot?.status} error={renderSnapshot?.error?.message} />
    </main>
  );
}

function createEditorStoreForPage(): EditorStore {
  return createEditorStore(createEmptyProject());
}

import { createEditorStore } from "../../domain/editor/editor-store";
