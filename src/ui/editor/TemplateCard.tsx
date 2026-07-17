import { useEffect, useState } from "react";
import { getTemplateDefaultParams } from "../../domain/templates/registry";
import type { TemplateCategory, TemplateDefinition } from "../../domain/templates/types";
import { writeTemplateDragData } from "./drag-and-drop";

export type TemplateCardProps = {
  template: TemplateDefinition;
  onAddTemplate?: (templateId: string) => void;
  onPreview?: (template: TemplateDefinition) => void;
};

const categoryLabels: Record<TemplateCategory, string> = {
  "information-overlay": "信息叠加",
  "decorative-animation": "装饰动画",
  transition: "片段转场",
};

/** 中文注释：模板卡片用模板自身的 Remotion 渲染函数做短预览，避免维护第二套视觉实现。 */
export function TemplateCard({ template, onAddTemplate, onPreview }: TemplateCardProps) {
  const [previewing, setPreviewing] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!previewing) return;
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % Math.max(1, template.defaultDurationInFrames));
    }, 50);
    return () => window.clearInterval(timer);
  }, [previewing, template.defaultDurationInFrames]);

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
          <button
            aria-label={`${previewing ? "停止" : "预览"}${template.name}`}
            onClick={() => {
              setPreviewing((current) => !current);
              onPreview?.(template);
            }}
            type="button"
          >{previewing ? "停止" : "预览"}</button>
          <button aria-label={`添加${template.name}`} onClick={() => onAddTemplate?.(template.id)} type="button">添加</button>
        </div>
      </div>
    </article>
  );
}
