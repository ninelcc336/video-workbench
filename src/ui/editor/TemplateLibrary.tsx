import { useMemo, useState } from "react";
import { listTemplates } from "../../domain/templates/registry";
import type { TemplateCategory } from "../../domain/templates/types";

export type TemplateLibraryProps = {
  onAddTemplate?: (templateId: string) => void;
};

const categoryLabels: Record<"all" | TemplateCategory, string> = {
  all: "全部",
  "information-overlay": "信息叠加",
  "decorative-animation": "装饰动画",
  transition: "片段转场",
};

/** 中文注释：首版用按钮添加模板，拖放属于后续任务；用户先通过动效名称和分类发现模板。 */
export function TemplateLibrary({ onAddTemplate }: TemplateLibraryProps) {
  const [category, setCategory] = useState<"all" | TemplateCategory>("all");
  const templates = useMemo(() => listTemplates(category === "all" ? undefined : category), [category]);
  return (
    <section className="library-section template-library">
      <div className="library-section__heading"><div><span className="eyebrow">02 / 动效</span><h2>特效模板</h2></div><span className="count-badge">{templates.length}</span></div>
      <div className="category-tabs" role="tablist">
        {(Object.keys(categoryLabels) as Array<"all" | TemplateCategory>).map((item) => (
          <button aria-selected={category === item} className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)} role="tab" type="button">{categoryLabels[item]}</button>
        ))}
      </div>
      <div className="template-list">
        {templates.map((template, index) => (
          <article className="template-card" key={`${template.id}@${template.version}`}>
            <div className={`template-card__preview template-card__preview--${index % 3}`}><span>{template.category === "transition" ? "↗" : template.category === "decorative-animation" ? "✦" : "Aa"}</span></div>
            <div className="template-card__content"><div><strong>{template.name}</strong><p>{template.description}</p></div><button aria-label={`添加${template.name}`} onClick={() => onAddTemplate?.(template.id)} type="button">添加</button></div>
          </article>
        ))}
      </div>
    </section>
  );
}
