import type { EditorStore } from "../editor/editor-store";
import type { EditProject, EffectClip } from "../project/model";

/** 中文注释：视频模板只保留特效片段布局，不绑定任何视频素材。 */
export type VideoTemplateEffectClip = Omit<EffectClip, "id">;

export type VideoTemplate = {
  id: string;
  name: string;
  effectClips: ReadonlyArray<VideoTemplateEffectClip>;
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

  return {
    id,
    name: assertValidName(name),
    effectClips: project.effectClips.map(({ id: _id, ...clip }) => ({
      ...clip,
      fromFrame: clip.fromFrame - originFrame,
      params: cloneParams(clip.params),
    })),
  };
}

/** 中文注释：仓储写入时使用白名单，明确排除 mediaId、文件路径等项目数据。 */
export function serializeVideoTemplate(template: VideoTemplate): Omit<VideoTemplate, "id"> {
  return {
    name: template.name,
    effectClips: template.effectClips.map((clip) => ({
      templateId: clip.templateId,
      templateVersion: clip.templateVersion,
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

  template.effectClips.forEach((clip, index) => {
    store.dispatch({
      type: "add-effect-clip",
      clip: {
        ...clip,
        id: createEffectClipId(index),
        fromFrame: targetStartFrame + clip.fromFrame,
        params: cloneParams(clip.params),
      },
    });
  });
}
