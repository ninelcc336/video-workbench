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

/** 中文注释：模板卡片用模板自身的 Remotion 渲染函数做短预览，避免维护第二套视觉实现。 */
export function TemplateCard({ template, onAddTemplate }: TemplateCardProps) {
  const [frame, setFrame] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // 中文注释：模板卡片默认停在首帧，只有鼠标悬浮时才创建预览计时器，避免左侧列表同时消耗动画资源。
    if (!isHovered) return undefined;

    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % Math.max(1, template.defaultDurationInFrames));
    }, 50);
    return () => window.clearInterval(timer);
  }, [isHovered, template.defaultDurationInFrames]);

  /** 中文注释：鼠标移入开始预览，保留当前首帧状态以便从头播放。 */
  const handleMouseEnter = () => {
    setFrame(0);
    setIsHovered(true);
  };

  /** 中文注释：鼠标移出立即停止预览并回到首帧，保证未悬浮卡片始终静止。 */
  const handleMouseLeave = () => {
    setIsHovered(false);
    setFrame(0);
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
      className="template-card"
      draggable
      onDragStart={(event) => writeTemplateDragData(event.dataTransfer, template)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="template-card__preview" aria-label={`${template.name}动效预览`}>
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
          {preview}
        </div>
      </div>
      <div className="template-card__content">
        <div>
          <strong>{template.name}</strong>
          <p>{categoryLabels[template.category]} · {template.description}</p>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button aria-label={`添加${template.name}`} onClick={() => onAddTemplate?.(template.id)} type="button">添加</button>
        </div>
      </div>
    </article>
  );
}
