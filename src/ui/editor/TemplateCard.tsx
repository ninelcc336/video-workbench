import { useEffect, useRef, useState } from "react";
import type { DragEvent, FocusEvent } from "react";
import { getTemplateDefaultParams } from "../../domain/templates/registry";
import type { EffectFamilySummary, TemplateCategory, TemplateDefinition } from "../../domain/templates/types";
import { writeTemplateDragData } from "./drag-and-drop";

export type TemplateUsageReference = {
  familyId: string;
  version: number;
  startingStyleId: string;
};

export type TemplateCardProps = {
  template: TemplateDefinition;
  /** 中文注释：新版族摘要只负责目录展示，实际渲染仍由 template 适配器提供。 */
  family?: EffectFamilySummary;
  isSelected?: boolean;
  canAdd?: boolean;
  addDisabledReason?: string;
  onInvalidAction?: () => void;
  onStartingStyleChange?: (startingStyleId: string) => void;
  onTemplateUsed?: (reference: TemplateUsageReference) => void;
  onAddTemplate?: (templateId: string, startingStyleId?: string) => void;
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

/**
 * 中文注释：用 IntersectionObserver 判断卡片是否进入滚动容器视口；浏览器不支持观察器时保留静态缩略图，
 * 但不自动启动计时器，保证旧测试环境和无观察器环境都不会产生持续动画负载。
 */
function useCardVisibility(cardRef: React.RefObject<HTMLElement | null>): boolean {
  const supportsVisibilityObserver = typeof window !== "undefined" && "IntersectionObserver" in window;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!supportsVisibilityObserver || !cardRef.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry?.isIntersecting === true);
    }, { threshold: 0.1 });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [cardRef, supportsVisibilityObserver]);

  return isVisible;
}

/** 中文注释：模板卡片只在可见、悬停、键盘聚焦或当前选中时运行短预览，离开这些状态即清理计时器。 */
export function TemplateCard({
  template,
  family,
  isSelected = false,
  canAdd = true,
  addDisabledReason = "片段转场只能放在相邻视频片段交界点。",
  onInvalidAction,
  onStartingStyleChange,
  onTemplateUsed,
  onAddTemplate,
}: TemplateCardProps) {
  const representativeFrame = getRepresentativePreviewFrame(template.defaultDurationInFrames);
  const [frame, setFrame] = useState(representativeFrame);
  const [isEngaged, setIsEngaged] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const isVisible = useCardVisibility(cardRef);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isPreviewActive = !prefersReducedMotion && (isVisible || isEngaged || isSelected);
  const selectedStyleId = template.startingStyleId ?? family?.startingStyles[0]?.id;
  const usageReference = template.effectFamilyId && selectedStyleId
    ? {
        familyId: template.effectFamilyId,
        version: template.version,
        startingStyleId: selectedStyleId,
      }
    : undefined;

  useEffect(() => {
    if (prefersReducedMotion || !isPreviewActive) {
      setFrame(representativeFrame);
      return undefined;
    }

    setFrame(0);
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % Math.max(1, template.defaultDurationInFrames));
    }, 50);
    return () => window.clearInterval(timer);
  }, [isPreviewActive, prefersReducedMotion, representativeFrame, template.defaultDurationInFrames]);

  /** 中文注释：鼠标或键盘进入卡片从首帧播放，让用户能观察完整入场动画。 */
  const handleEngage = () => {
    if (prefersReducedMotion) return;
    setFrame(0);
    setIsEngaged(true);
  };

  /** 中文注释：离开卡片后只清理交互状态，选中或仍在视口内的卡片继续按目录规则预览。 */
  const handleMouseLeave = () => {
    setIsEngaged(false);
  };

  /** 中文注释：焦点离开整个卡片时结束键盘预览，避免焦点在样式按钮之间移动时反复创建计时器。 */
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsEngaged(false);
  };

  /** 中文注释：拖放状态仅提供视觉反馈，模板身份仍由既有 DataTransfer 协议传递。 */
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    setIsDragging(true);
    writeTemplateDragData(event.dataTransfer, template);
  };

  /** 中文注释：拖放结束总会清理抓取状态，只有目标以 copy 确认成功时才写入最近使用记录。 */
  const handleDragEnd = (event: DragEvent<HTMLElement>) => {
    setIsDragging(false);
    if (event.dataTransfer?.dropEffect === "copy" && usageReference) {
      onTemplateUsed?.(usageReference);
    }
  };

  /** 中文注释：点击添加只在当前上下文允许时调用页面命令，成功返回后再更新最近使用记录。 */
  const addTemplate = () => {
    if (!canAdd) {
      onInvalidAction?.();
      return;
    }
    if (!onAddTemplate) return;
    if (selectedStyleId) onAddTemplate(template.id, selectedStyleId);
    else onAddTemplate(template.id);
    if (usageReference) onTemplateUsed?.(usageReference);
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
      aria-label={`${template.name}${family ? "特效族" : "特效模板"}`}
      className={`${isDragging ? "template-card template-card--dragging" : "template-card"}${isSelected ? " template-card--selected" : ""}`}
      draggable
      onBlur={handleBlur}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      onFocus={handleEngage}
      onMouseEnter={handleEngage}
      onMouseLeave={handleMouseLeave}
      ref={cardRef}
    >
      <div aria-label={`${template.name}动效预览`} className="template-card__preview">
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
          {preview}
        </div>
      </div>
      <div className="template-card__content">
        <div className="template-card__details">
          <strong>{template.name}</strong>
          <p>{categoryLabels[template.category]} · {template.description}</p>
          {family ? (
            <div aria-label={`${family.name}用途标签`} className="template-card__tags">
              {family.purposeTags.map((tag) => <span key={tag}>{tag}</span>)}
              {family.visualDirections.map((direction) => <span key={direction}>{direction}</span>)}
            </div>
          ) : null}
        </div>
        {family && family.startingStyles.length > 1 ? (
          <div aria-label={`${family.name}起始样式`} className="template-card__styles" role="radiogroup">
            {family.startingStyles.map((style) => (
              <button
                aria-checked={selectedStyleId === style.id}
                key={style.id}
                onClick={() => onStartingStyleChange?.(style.id)}
                role="radio"
                type="button"
              >
                {style.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="template-card__actions">
          <button
            aria-label={`添加${template.name}`}
            aria-disabled={!canAdd}
            onClick={addTemplate}
            title={canAdd ? "添加到当前播放头" : addDisabledReason}
            type="button"
          >
            添加
          </button>
        </div>
      </div>
    </article>
  );
}
