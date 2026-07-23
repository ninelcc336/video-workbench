import { useEffect, useState } from "react";
import { getTemplateDefaultParams } from "../../domain/templates/registry";
import type { TemplateCategory, TemplateDefinition } from "../../domain/templates/types";
import { writeTemplateDragData } from "./drag-and-drop";

export type TemplateCardProps = {
  template: TemplateDefinition;
  onAddTemplate?: (templateId: string) => void;
};

const categoryLabels: Record<TemplateCategory, string> = {
  "information-overlay": "信息叠加",
  "decorative-animation": "装饰动画",
  transition: "片段转场",
};

/** 中文注释：静止缩略图取片段中点，避开多数模板第 0 帧的入场前空白状态，同时保留完整的特效内容。 */
function getRepresentativePreviewFrame(durationInFrames: number): number {
  return Math.max(0, Math.floor(Math.max(1, durationInFrames) / 2));
}

/** 中文注释：尊重系统减少动态效果偏好，避免模板列表在辅助场景中持续刷新动效。 */
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;
    const updatePreference = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

/** 中文注释：模板卡片用模板自身的 Remotion 渲染函数做短预览，避免维护第二套视觉实现。 */
export function TemplateCard({ template, onAddTemplate }: TemplateCardProps) {
  const representativeFrame = getRepresentativePreviewFrame(template.defaultDurationInFrames);
  const [frame, setFrame] = useState(representativeFrame);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // 中文注释：卡片默认显示代表帧，只有鼠标悬浮或键盘聚焦时才创建预览计时器，避免左侧列表同时消耗动画资源。
    if (!isHovered || prefersReducedMotion) return undefined;

    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % Math.max(1, template.defaultDurationInFrames));
    }, 50);
    return () => window.clearInterval(timer);
  }, [isHovered, prefersReducedMotion, template.defaultDurationInFrames]);

  useEffect(() => {
    // 中文注释：系统要求减少动态效果时立刻回到代表帧，保证预览不会在无意中继续播放。
    if (prefersReducedMotion) setFrame(representativeFrame);
  }, [prefersReducedMotion, representativeFrame]);

  /** 中文注释：鼠标移入从首帧播放，让用户能观察完整入场动画。 */
  const handleMouseEnter = () => {
    if (prefersReducedMotion) return;
    setFrame(0);
    setIsHovered(true);
  };

  /** 中文注释：鼠标移出立即停止预览并回到代表帧，保证未悬浮卡片展示可识别的特效内容。 */
  const handleMouseLeave = () => {
    setIsHovered(false);
    setFrame(representativeFrame);
  };

  /** 中文注释：键盘焦点与鼠标悬浮复用同一预览节奏，让非鼠标用户也能先看到模板效果。 */
  const handleFocus = () => {
    if (prefersReducedMotion) return;
    setFrame(0);
    setIsHovered(true);
  };

  /** 中文注释：拖放状态仅提供视觉反馈，模板身份仍由既有 DataTransfer 协议传递。 */
  const handleDragStart = (event: React.DragEvent<HTMLElement>) => {
    setIsDragging(true);
    writeTemplateDragData(event.dataTransfer, template);
  };

  /** 中文注释：无论拖放成功或取消都清理卡片状态，避免留下错误的抓取高亮。 */
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const preview = template.render({
    frame,
    fps: 30,
    width: 240,
    height: 140,
    durationInFrames: template.defaultDurationInFrames,
    params: getTemplateDefaultParams(template),
  });

  return (
    <article
      aria-label={`${template.name}特效模板`}
      className={isDragging ? "template-card template-card--dragging" : "template-card"}
      draggable
      onBlur={handleMouseLeave}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="template-card__preview" aria-label={`${template.name}动效预览`}>
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
          {preview}
        </div>
      </div>
      <div className="template-card__content">
        <div className="template-card__details">
          <strong>{template.name}</strong>
          <p>{categoryLabels[template.category]} · {template.description}</p>
        </div>
        <div className="template-card__actions">
          <button aria-label={`添加${template.name}`} onClick={() => onAddTemplate?.(template.id)} title="添加到当前播放头" type="button">添加</button>
        </div>
      </div>
    </article>
  );
}
