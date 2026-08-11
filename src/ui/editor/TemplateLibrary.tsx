import { useMemo, useState } from "react";
import {
  createTemplateDefinitionAdapter,
  getEffectFamily,
  listEffectFamilies,
  type EffectFamilyQuery,
} from "../../domain/templates/effect-family";
import type {
  EffectFamilySummary,
  TemplateCategory,
  TemplateDefinition,
} from "../../domain/templates/types";
import type { TemplateTransitionBoundary } from "./drag-and-drop";
import {
  getRecentEffectReferences,
  rememberEffectReference,
} from "./template-library-state";
import { TemplateCard, type TemplateUsageReference } from "./TemplateCard";

export type { TemplateTransitionBoundary } from "./drag-and-drop";

export type TemplateLibraryProps = {
  onAddTemplate?: (templateId: string, startingStyleId?: string) => void;
  /** 中文注释：播放头添加作为拖放之外的辅助入口，帧值由页面快照提供。 */
  currentFrame?: number;
  onAddTemplateAtFrame?: (template: TemplateDefinition, frame: number) => void;
  /** 中文注释：当前选中特效用于保持对应族的预览，即使该卡片暂时离开滚动视口。 */
  selectedEffectFamilyId?: string | null;
  onOpenPresets?: () => void;
  transitionBoundary?: TemplateTransitionBoundary | null;
  onAddTransitionAtBoundary?: (
    template: TemplateDefinition,
    boundary: TemplateTransitionBoundary,
  ) => void;
  onInvalidTransition?: () => void;
};

type LibraryView = "all" | "recent";

const categoryLabels: Record<"all" | TemplateCategory, string> = {
  all: "全部",
  "information-overlay": "信息叠加",
  "decorative-animation": "装饰动画",
  transition: "片段转场",
};

const RECENT_VIEW_LABEL = "最近使用";

function familyKey(family: Pick<EffectFamilySummary, "id" | "version">): string {
  return `${family.id}@${family.version}`;
}

/** 中文注释：新目录隐藏旧版全屏转场，保留历史渲染器但不让它被误用为真实片段转场。 */
function isVisibleLibraryFamily(family: EffectFamilySummary): boolean {
  return !(family.legacy === true && family.category === "transition");
}

/** 中文注释：目录和最近入口共享同一可见族查询，统一包含旧版信息/装饰模板并隐藏历史全屏转场。 */
function listVisibleLibraryFamilies(query: Omit<EffectFamilyQuery, "includeLegacy"> = {}): EffectFamilySummary[] {
  return listEffectFamilies({ ...query, includeLegacy: true }).filter(isVisibleLibraryFamily);
}

/** 中文注释：最近入口按浏览器记录顺序重排族摘要，失效的旧族身份会自动从结果中消失。 */
function orderRecentFamilies(
  families: EffectFamilySummary[],
  recentReferences: ReturnType<typeof getRecentEffectReferences>,
): EffectFamilySummary[] {
  const familyMap = new Map(families.map((family) => [familyKey(family), family]));
  return recentReferences
    .map((reference) => familyMap.get(`${reference.familyId}@${reference.version}`))
    .filter((family): family is EffectFamilySummary => family !== undefined);
}

/** 中文注释：目录卡片按特效族聚合，样式身份只在卡片内部切换，不把同族样式拆成平级模板。 */
export function TemplateLibrary({
  onAddTemplate,
  currentFrame = 0,
  onAddTemplateAtFrame,
  selectedEffectFamilyId = null,
  onOpenPresets,
  transitionBoundary = null,
  onAddTransitionAtBoundary,
  onInvalidTransition,
}: TemplateLibraryProps) {
  const [category, setCategory] = useState<"all" | TemplateCategory>("all");
  const [view, setView] = useState<LibraryView>("all");
  const [searchText, setSearchText] = useState("");
  const [purposeTag, setPurposeTag] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<Record<string, string>>({});
  const [recentReferences, setRecentReferences] = useState(getRecentEffectReferences);

  const allFamilies = useMemo(
    () => listVisibleLibraryFamilies(),
    [],
  );
  const purposeTags = useMemo(
    () => [...new Set(allFamilies.flatMap((family) => family.purposeTags))].sort((left, right) => left.localeCompare(right, "zh-CN")),
    [allFamilies],
  );
  const families = useMemo(() => {
    const filtered = listVisibleLibraryFamilies({
      category: category === "all" ? undefined : category,
      purposeTag: purposeTag || undefined,
      text: searchText,
    });
    return view === "recent" ? orderRecentFamilies(filtered, recentReferences) : filtered;
  }, [category, purposeTag, recentReferences, searchText, view]);

  /** 中文注释：切换分类只改变目录结果，不影响搜索文字、最近记录或当前播放头。 */
  const selectCategory = (nextCategory: "all" | TemplateCategory) => {
    setCategory(nextCategory);
    setView("all");
  };

  /** 中文注释：全部特效入口同时清除分类限制，保证从任意分类返回完整目录。 */
  const selectAllFamilies = () => {
    setCategory("all");
    setView("all");
  };

  /** 中文注释：样式选择只更新当前卡片的族内视图，真正添加时才生成对应起始样式适配器。 */
  const selectStartingStyle = (family: EffectFamilySummary, startingStyleId: string) => {
    setSelectedStyles((current) => ({ ...current, [familyKey(family)]: startingStyleId }));
  };

  /** 中文注释：点击或拖动成功使用特效后仅更新浏览器最近记录，不触碰视频工作区项目快照。 */
  const rememberUsage = (reference: TemplateUsageReference) => {
    setRecentReferences(rememberEffectReference(reference));
  };

  /** 中文注释：失效的浏览器样式记录回退到族首个样式，避免目录卡片无法渲染。 */
  const getSelectedStyleId = (family: EffectFamilySummary): string => {
    const selectedStyleId = selectedStyles[familyKey(family)];
    return family.startingStyles.some((style) => style.id === selectedStyleId)
      ? selectedStyleId
      : family.startingStyles[0].id;
  };

  /** 中文注释：普通特效保持原来的播放头添加和拖放回调；片段转场只有拿到合法交界点才进入页面命令层。 */
  const addFamily = (family: EffectFamilySummary, startingStyleId: string) => {
    const template = createTemplateDefinitionAdapter(getEffectFamily(family.id, family.version), startingStyleId);
    if (family.category === "transition") {
      if (!transitionBoundary || !onAddTransitionAtBoundary) {
        onInvalidTransition?.();
        return;
      }
      onAddTransitionAtBoundary(template, transitionBoundary);
      return;
    }

    if (onAddTemplateAtFrame) {
      onAddTemplateAtFrame(template, Math.max(0, Math.round(currentFrame)));
      return;
    }
    onAddTemplate?.(template.id, startingStyleId);
  };

  return (
    <section className="library-section template-library">
      <div className="library-section__heading">
        <div><span className="eyebrow">02 / 动效</span><h2>特效模板</h2></div>
        <span className="count-badge">{families.length}</span>
      </div>
      <div aria-label="特效库入口" className="library-quick-tabs" role="tablist">
        <button
          aria-selected={view === "all"}
          className={view === "all" ? "active" : ""}
          onClick={selectAllFamilies}
          role="tab"
          type="button"
        >
          全部特效
        </button>
        <button
          aria-selected={view === "recent"}
          className={view === "recent" ? "active" : ""}
          onClick={() => setView("recent")}
          role="tab"
          type="button"
        >
          {RECENT_VIEW_LABEL}
        </button>
        <button aria-label="打开我的预设" className="library-quick-action" onClick={onOpenPresets} title="个人预设" type="button">
          个人预设
        </button>
      </div>
      <label className="template-library__search">
        <span>查找特效</span>
        <input
          aria-label="搜索特效库"
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="名称、用途或场景"
          type="search"
          value={searchText}
        />
      </label>
      <label className="template-library__filter">
        <span>用途标签</span>
        <select aria-label="按用途筛选" onChange={(event) => setPurposeTag(event.target.value)} value={purposeTag}>
          <option value="">全部用途</option>
          {purposeTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      </label>
      <div aria-label="特效类型" className="category-tabs" role="tablist">
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
      <p className="muted-copy">
        {category === "transition"
          ? "片段转场只能放在相邻视频片段交界点。"
          : "拖动卡片到时间轴，或在播放头位置点击添加。"}
      </p>
      <div aria-labelledby={`template-category-${category}`} className="template-list" id="template-library-results" role="tabpanel">
        {families.length === 0 ? <p className="muted-copy">没有匹配的特效族。</p> : families.map((family) => {
          const startingStyleId = getSelectedStyleId(family);
          const template = createTemplateDefinitionAdapter(getEffectFamily(family.id, family.version), startingStyleId);
          const isSelected = selectedEffectFamilyId === family.id;
          const canAddTransition = family.category !== "transition" || Boolean(transitionBoundary && onAddTransitionAtBoundary);
          return (
            <TemplateCard
              canAdd={canAddTransition}
              family={family}
              isSelected={isSelected}
              key={familyKey(family)}
              onAddTemplate={() => addFamily(family, startingStyleId)}
              onInvalidAction={family.category === "transition" ? onInvalidTransition : undefined}
              onStartingStyleChange={(nextStyleId) => selectStartingStyle(family, nextStyleId)}
              onTemplateUsed={rememberUsage}
              template={template}
            />
          );
        })}
      </div>
    </section>
  );
}
