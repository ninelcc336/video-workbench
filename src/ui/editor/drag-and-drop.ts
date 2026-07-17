import { getTemplateDefaultParams } from "../../domain/templates/registry";
import type { EffectClip } from "../../domain/project/model";
import type { TemplateDefinition } from "../../domain/templates/types";

/** 中文注释：使用自定义 MIME 类型，避免模板拖放与普通文本拖放混淆。 */
export const TEMPLATE_DRAG_MIME = "application/x-video-effect-template";

export type TemplateDragData = {
  templateId: string;
  templateVersion: number;
};

function createId(prefix: string): string {
  const randomUUID = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomUUID}`;
}

/** 中文注释：所有拖入项目的模板片段都从模板声明生成完整默认参数。 */
export function createEffectClipFromTemplate(
  template: TemplateDefinition,
  dropFrame: number,
): EffectClip {
  const safeDropFrame = Number.isFinite(dropFrame)
    ? Math.max(0, Math.round(dropFrame))
    : 0;

  return {
    id: createId("effect"),
    templateId: template.id,
    templateVersion: template.version,
    trackId: "effects-1",
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
    return {
      templateId: value.templateId,
      templateVersion,
    };
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
