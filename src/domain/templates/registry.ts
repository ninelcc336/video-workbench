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
};

export const getTemplate = (templateId: string, version?: number): TemplateDefinition => {
  if (version !== undefined) {
    const template = templates.get(templateKey(templateId, version));
    if (template) {
      return template;
    }
  } else {
    const candidates = [...templates.values()]
      .filter((template) => template.id === templateId)
      .sort((left, right) => right.version - left.version);
    if (candidates[0]) {
      return candidates[0];
    }
  }

  throw new Error(
    version === undefined
      ? `未找到特效模板：${templateId}`
      : `未找到特效模板：${templateId}@${version}`,
  );
};

export const listTemplates = (category?: TemplateCategory): TemplateSummary[] =>
  [...templates.values()]
    .filter((template) => category === undefined || template.category === category)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
    .map(({ parameters: _parameters, render: _render, ...summary }) => summary);

export const normalizeParams = (
  template: TemplateDefinition,
  params: Record<string, unknown> | undefined,
): Record<string, unknown> => normalizeParameterValues(template.parameters, params);

export const getTemplateDefaultParams = (
  template: TemplateDefinition,
): Record<string, unknown> => getDefaultParams(template.parameters);

// 中文注释：内置模板在模块加载时注册，后续 UI 只依赖注册表，不直接依赖具体模板文件。
registerTemplate(CardOverlay.definition);
registerTemplate(BubbleDecoration.definition);
registerTemplate(BasicTransition.definition);
registerTemplate(SectionTitleOverlay.definition);
registerTemplate(ChecklistOverlay.definition);
registerTemplate(CommentPanelOverlay.definition);
registerTemplate(TagPillsOverlay.definition);
