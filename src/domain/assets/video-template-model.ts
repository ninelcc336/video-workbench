import type { EditorStore } from "../editor/editor-store";
import type { EditProject, EffectClip } from "../project/model";

/** 中文注释：视频模板只保留特效片段布局，不绑定任何视频素材。 */
export type VideoTemplateEffectClip = Omit<EffectClip, "id">;

export type VideoTemplate = {
  id: string;
  name: string;
  effectClips: ReadonlyArray<VideoTemplateEffectClip>;
  /** 中文注释：模板创建时的帧率用于跨项目换算秒数，当前格式始终显式保存。 */
  fps: number;
};

function cloneParams(params: Record<string, unknown>): Record<string, unknown> {
  // 中文注释：模板保存自己的参数快照，后续编辑项目不会反向修改模板。
  return structuredClone(params);
}

function assertValidName(name: string): string {
  if (!name.trim()) {
    throw new Error("视频模板名称不能为空");
  }
  return name.trim();
}

function assertValidFrame(frame: number, label: string): void {
  if (!Number.isInteger(frame) || frame < 0) {
    throw new RangeError(`${label}必须是非负整数帧`);
  }
}

/** 中文注释：把当前特效轨道的最早帧作为原点，保存为从零开始的相对布局。 */
export function createVideoTemplate(
  id: string,
  name: string,
  project: EditProject,
): VideoTemplate {
  if (!id.trim()) {
    throw new Error("视频模板 ID 不能为空");
  }
  const originFrame = project.effectClips.reduce(
    (origin, clip) => Math.min(origin, clip.fromFrame),
    project.effectClips[0]?.fromFrame ?? 0,
  );

  const effectClips = project.effectClips.map(({ id: _id, ...clip }) => {
    if (clip.placement.type === "boundary") {
      throw new Error("真实片段转场绑定当前视频工作区，不能保存到可复用视频模板");
    }
    return {
      ...clip,
      fromFrame: clip.fromFrame - originFrame,
      params: cloneParams(clip.params),
    };
  });
  const template: VideoTemplate = {
    id,
    name: assertValidName(name),
    fps: project.settings.fps,
    effectClips,
  };
  return template;
}

/** 中文注释：仓储写入时使用白名单，明确排除 mediaId、文件路径等项目数据。 */
export function serializeVideoTemplate(template: VideoTemplate): Omit<VideoTemplate, "id"> {
  return {
    name: template.name,
    fps: template.fps,
    effectClips: template.effectClips.map((clip) => ({
      templateId: clip.templateId,
      templateVersion: clip.templateVersion,
      effectFamilyId: clip.effectFamilyId,
      startingStyleId: clip.startingStyleId,
      placement: clip.placement,
      trackId: clip.trackId,
      fromFrame: clip.fromFrame,
      durationInFrames: clip.durationInFrames,
      params: cloneParams(clip.params),
    })),
  };
}

export type EffectClipIdFactory = (index: number) => string;

/** 中文注释：将模板片段转换成编辑命令，目标项目中的视频片段保持不变。 */
export function applyVideoTemplate(
  store: EditorStore,
  template: VideoTemplate,
  targetStartFrame = 0,
  createEffectClipId: EffectClipIdFactory = (index) =>
    `effect-template-${index}-${crypto.randomUUID()}`,
): void {
  assertValidFrame(targetStartFrame, "模板应用起点");
  const targetFps = store.getSnapshot().settings.fps;
  const sourceFps = template.fps;
  const existingClips = store.getSnapshot().effectClips;
  const addedClips: EffectClip[] = [];

  /** 中文注释：为模板中的每个片段选择不重叠的最小特效轨道，避免覆盖已有布局。 */
  const getTrackId = (fromFrame: number, durationInFrames: number): string => {
    for (let index = 1; index <= existingClips.length + addedClips.length + 1; index += 1) {
      const trackId = `effects-${index}`;
      const occupied = [...existingClips, ...addedClips].some((clip) => clip.trackId === trackId
        && clip.fromFrame < fromFrame + durationInFrames
        && fromFrame < clip.fromFrame + clip.durationInFrames);
      if (!occupied) return trackId;
    }
    return `effects-${existingClips.length + addedClips.length + 1}`;
  };

  template.effectClips.forEach((clip, index) => {
    const fromFrame = targetStartFrame + Math.round(clip.fromFrame / sourceFps * targetFps);
    const durationInFrames = Math.max(1, Math.round(clip.durationInFrames / sourceFps * targetFps));
    addedClips.push({
      ...clip,
      id: createEffectClipId(index),
      trackId: getTrackId(fromFrame, durationInFrames),
      fromFrame,
      durationInFrames,
      params: cloneParams(clip.params),
    });
  });
  if (addedClips.length > 0) store.dispatch({ type: "add-effect-clips", clips: addedClips });
}
