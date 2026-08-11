import { getTemplateDefaultParams } from "../../domain/templates/registry";
import type { EditProject, EffectClip } from "../../domain/project/model";
import type { TemplateDefinition } from "../../domain/templates/types";

/** 中文注释：使用自定义 MIME 类型，避免模板拖放与普通文本拖放混淆。 */
export const TEMPLATE_DRAG_MIME = "application/x-video-effect-template";

export type TemplateDragData = {
  templateId: string;
  templateVersion: number;
  startingStyleId?: string;
};

export type TemplateTransitionBoundary = {
  beforeVideoClipId: string;
  afterVideoClipId: string;
  frame: number;
};

type EffectClipCreationOptions = {
  trackId?: string;
  placement?: EffectClip["placement"];
};

function createId(prefix: string): string {
  const randomUUID = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomUUID}`;
}

/**
 * 中文注释：从模板声明创建特效片段；拖放默认使用 effects-1，页面命令可注入实际轨道和交界点绑定。
 * 无效帧会回退到 0，参数始终从模板默认值深拷贝，避免新片段共享可变状态。
 */
export function createEffectClipFromTemplate(
  template: TemplateDefinition,
  dropFrame: number,
  options: EffectClipCreationOptions = {},
): EffectClip {
  const safeDropFrame = Number.isFinite(dropFrame)
    ? Math.max(0, Math.round(dropFrame))
    : 0;

  const familyIdentity = template.effectFamilyId && template.startingStyleId
    ? {
        effectFamilyId: template.effectFamilyId,
        startingStyleId: template.startingStyleId,
      }
    : {};

  return {
    id: createId("effect"),
    templateId: template.id,
    templateVersion: template.version,
    ...familyIdentity,
    ...(options.placement ? { placement: options.placement } : {}),
    trackId: options.trackId ?? "effects-1",
    fromFrame: safeDropFrame,
    durationInFrames: template.defaultDurationInFrames,
    params: getTemplateDefaultParams(template),
  };
}

/** 中文注释：将模板身份写入 DataTransfer，文本值用于不支持自定义 MIME 的浏览器回退。 */
export function writeTemplateDragData(
  dataTransfer: DataTransfer,
  template: TemplateDefinition,
): void {
  const payload: TemplateDragData = {
    templateId: template.id,
    templateVersion: template.version,
    ...(template.startingStyleId ? { startingStyleId: template.startingStyleId } : {}),
  };
  dataTransfer.setData(TEMPLATE_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData("text/plain", template.id);
  dataTransfer.effectAllowed = "copy";
}

/** 中文注释：只接受由本编辑器写入且字段完整的拖放身份。 */
export function readTemplateDragData(
  dataTransfer: DataTransfer,
): TemplateDragData | null {
  const raw = dataTransfer.getData(TEMPLATE_DRAG_MIME);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<TemplateDragData>;
    const templateVersion = value.templateVersion;
    if (
      typeof value.templateId !== "string" ||
      typeof templateVersion !== "number" ||
      !Number.isInteger(templateVersion) ||
      templateVersion < 1
    ) {
      return null;
    }
    const result: TemplateDragData = {
      templateId: value.templateId,
      templateVersion,
    };
    if (value.startingStyleId !== undefined) {
      if (typeof value.startingStyleId !== "string" || !value.startingStyleId.trim()) return null;
      result.startingStyleId = value.startingStyleId;
    }
    return result;
  } catch {
    return null;
  }
}

/** 中文注释：时间轴坐标统一以左边界为零点，并吸附到最近的非负整数帧。 */
export function getDropFrame(
  event: Pick<DragEvent, "clientX">,
  timelineElement: HTMLElement,
  pixelsPerFrame: number,
): number {
  if (!Number.isFinite(pixelsPerFrame) || pixelsPerFrame <= 0) {
    throw new RangeError("每帧像素必须是正数");
  }
  const rect = timelineElement.getBoundingClientRect();
  return Math.max(0, Math.round((event.clientX - rect.left) / pixelsPerFrame));
}

/**
 * 中文注释：只接受当前主视频轨道上严格相邻的两个片段，交界帧之外的拖放不能创建片段转场。
 * 该判断不修改项目，供时间轴和未来的转场添加命令共享。
 */
export function findTemplateTransitionBoundary(
  project: EditProject,
  frame: number,
): TemplateTransitionBoundary | null {
  const targetFrame = Number.isFinite(frame) ? Math.max(0, Math.round(frame)) : -1;
  const sortedClips = [...project.videoClips].sort((left, right) => left.fromFrame - right.fromFrame);

  for (let index = 1; index < sortedClips.length; index += 1) {
    const before = sortedClips[index - 1];
    const after = sortedClips[index];
    const boundaryFrame = before.fromFrame + before.durationInFrames;
    if (boundaryFrame === after.fromFrame && boundaryFrame === targetFrame) {
      return {
        beforeVideoClipId: before.id,
        afterVideoClipId: after.id,
        frame: boundaryFrame,
      };
    }
  }

  return null;
}
