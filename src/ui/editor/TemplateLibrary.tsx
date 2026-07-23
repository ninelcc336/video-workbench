import { useMemo, useState } from "react";
import { getTemplate, listTemplates } from "../../domain/templates/registry";
import type { TemplateCategory } from "../../domain/templates/types";
import type { TemplateDefinition } from "../../domain/templates/types";
import { TemplateCard } from "./TemplateCard";

export type TemplateLibraryProps = {
  onAddTemplate?: (templateId: string) => void;
  /** 中文注释：播放头添加作为拖放之外的辅助入口，帧值由页面快照提供。 */
  currentFrame?: number;
  onAddTemplateAtFrame?: (template: TemplateDefinition, frame: number) => void;
};

const categoryLabels: Record<"all" | TemplateCategory, string> = {
  all: "全部",
  "information-overlay": "信息叠加",
  "decorative-animation": "装饰动画",
  transition: "片段转场",
};

/** 中文注释：模板库负责筛选和发现，卡片负责拖放；点击添加时优先使用当前播放头。 */
export function TemplateLibrary({ onAddTemplate, currentFrame = 0, onAddTemplateAtFrame }: TemplateLibraryProps) {
  const [category, setCategory] = useState<"all" | TemplateCategory>("all");
  const templates = useMemo(() => listTemplates(category === "all" ? undefined : category), [category]);

  /** 中文注释：切换分类时只改变模板发现结果，不会影响时间轴或当前播放头。 */
  const selectCategory = (nextCategory: "all" | TemplateCategory) => {
    setCategory(nextCategory);
  };

  return (
    <section className="library-section template-library">
      <div className="library-section__heading"><div><span className="eyebrow">02 / 动效</span><h2>特效模板</h2></div><span className="count-badge">{templates.length}</span></div>
      <div aria-label="特效模板分类" className="category-tabs" role="tablist">
        {(Object.keys(categoryLabels) as Array<"all" | TemplateCategory>).map((item) => (
          <button
            aria-controls="template-library-results"
            aria-selected={category === item}
            className={category === item ? "active" : ""}
            id={`template-category-${item}`}
            key={item}
            onClick={() => selectCategory(item)}
            role="tab"
            type="button"
          >
            {categoryLabels[item]}
          </button>
        ))}
      </div>
      <p className="muted-copy">拖动卡片到时间轴，或在播放头位置点击添加。</p>
      <div aria-labelledby={`template-category-${category}`} className="template-list" id="template-library-results" role="tabpanel">
        {templates.map((summary) => {
          const template = getTemplate(summary.id, summary.version);
          return (
            <TemplateCard
              key={`${template.id}@${template.version}`}
              onAddTemplate={(templateId) => {
                if (onAddTemplateAtFrame) onAddTemplateAtFrame(getTemplate(templateId), Math.max(0, Math.round(currentFrame)));
                else onAddTemplate?.(templateId);
              }}
              template={template}
            />
          );
        })}
      </div>
    </section>
  );
}
