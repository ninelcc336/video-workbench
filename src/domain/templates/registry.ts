import { BubbleDecoration } from "../../remotion/templates/BubbleDecoration";
import { CardOverlay } from "../../remotion/templates/CardOverlay";
import { BasicTransition } from "../../remotion/templates/BasicTransition";
import { ChecklistOverlay } from "../../remotion/templates/ChecklistOverlay";
import { CommentPanelOverlay } from "../../remotion/templates/CommentPanelOverlay";
import { SectionTitleOverlay } from "../../remotion/templates/SectionTitleOverlay";
import { TagPillsOverlay } from "../../remotion/templates/TagPillsOverlay";
import {
  getDefaultParams,
  normalizeParameterValues,
} from "./parameter-schema";
import {
  createTemplateDefinitionAdapter,
  getEffectFamily,
  listEffectFamilies,
  registerLegacyTemplate,
} from "./effect-family";
import type {
  TemplateCategory,
  TemplateDefinition,
  TemplateSummary,
} from "./types";

const templates = new Map<string, TemplateDefinition>();

const templateKey = (id: string, version: number): string => `${id}@${version}`;

export const registerTemplate = (template: TemplateDefinition): void => {
  const key = templateKey(template.id, template.version);

  if (templates.has(key)) {
    throw new Error(`重复注册特效模板：${key}`);
  }

  templates.set(key, template);
  // 中文注释：旧模板继续由原注册表提供兼容类型，同时登记统一族适配器供新版渲染入口读取。
  registerLegacyTemplate(template);
};

export const getTemplate = (templateId: string, version?: number): TemplateDefinition => {
  if (version !== undefined) {
    const template = templates.get(templateKey(templateId, version));
    if (template) {
      return template;
    }
    try {
      return createTemplateDefinitionAdapter(getEffectFamily(templateId, version));
    } catch {
      // 中文注释：统一族查找失败后继续走原有错误消息，保持旧调用方的异常契约。
    }
  } else {
    const candidates = [...templates.values()]
      .filter((template) => template.id === templateId)
      .sort((left, right) => right.version - left.version);
    if (candidates[0]) {
      return candidates[0];
    }
    try {
      return createTemplateDefinitionAdapter(getEffectFamily(templateId));
    } catch {
      // 中文注释：统一族查找失败后继续走原有错误消息，保持旧调用方的异常契约。
    }
  }

  throw new Error(
    version === undefined
      ? `未找到特效模板：${templateId}`
      : `未找到特效模板：${templateId}@${version}`,
  );
};

function toTemplateSummary(template: TemplateDefinition): TemplateSummary {
  const { parameters: _parameters, render: _render, defaultParams: _defaultParams, ...summary } = template;
  return summary;
}

/** 中文注释：旧模板摘要与新版族适配摘要合并，确保现有模板库能发现已注册的新版族。 */
export const listTemplates = (category?: TemplateCategory): TemplateSummary[] => [
  ...[...templates.values()]
    .filter((template) => category === undefined || template.category === category)
    .map(toTemplateSummary),
  ...listEffectFamilies({ category }).map((summary) =>
    toTemplateSummary(createTemplateDefinitionAdapter(getEffectFamily(summary.id, summary.version))),
  ),
].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

export const normalizeParams = (
  template: TemplateDefinition,
  params: Record<string, unknown> | undefined,
): Record<string, unknown> => normalizeParameterValues(template.parameters, params);

export const getTemplateDefaultParams = (
  template: TemplateDefinition,
): Record<string, unknown> => template.defaultParams
  ? structuredClone(template.defaultParams)
  : getDefaultParams(template.parameters);

// 中文注释：内置模板在模块加载时注册，后续 UI 只依赖注册表，不直接依赖具体模板文件。
registerTemplate(CardOverlay.definition);
registerTemplate(BubbleDecoration.definition);
registerTemplate(BasicTransition.definition);
registerTemplate(SectionTitleOverlay.definition);
registerTemplate(ChecklistOverlay.definition);
registerTemplate(CommentPanelOverlay.definition);
registerTemplate(TagPillsOverlay.definition);
