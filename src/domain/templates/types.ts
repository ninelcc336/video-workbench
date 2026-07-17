import type { ReactNode } from "react";

/** 中文注释：参数声明是模板与编辑器控件之间唯一需要稳定共享的契约。 */
export type ParameterBase = {
  key: string;
  label: string;
  description?: string;
};

export type TextParameterDefinition = ParameterBase & {
  type: "text";
  defaultValue: string;
  maxLength?: number;
};

export type ColorParameterDefinition = ParameterBase & {
  type: "color";
  defaultValue: string;
};

export type NumberParameterDefinition = ParameterBase & {
  type: "number";
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
};

export type SelectParameterDefinition = ParameterBase & {
  type: "select";
  defaultValue: string;
  options: ReadonlyArray<{ value: string; label: string }>;
};

export type BooleanParameterDefinition = ParameterBase & {
  type: "boolean";
  defaultValue: boolean;
};

export type PositionParameterDefinition = ParameterBase & {
  type: "position";
  defaultValue: { x: number; y: number };
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
};

export type SizeParameterDefinition = ParameterBase & {
  type: "size";
  defaultValue: { width: number; height: number };
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
};

export type ParameterDefinition =
  | TextParameterDefinition
  | ColorParameterDefinition
  | NumberParameterDefinition
  | SelectParameterDefinition
  | BooleanParameterDefinition
  | PositionParameterDefinition
  | SizeParameterDefinition;

export type TemplateCategory =
  | "information-overlay"
  | "decorative-animation"
  | "transition";

export type TemplateRenderProps = {
  frame: number;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  params: Record<string, unknown>;
};

export type TemplateDefinition = {
  id: string;
  version: number;
  category: TemplateCategory;
  name: string;
  description: string;
  defaultDurationInFrames: number;
  parameters: ReadonlyArray<ParameterDefinition>;
  render: (props: TemplateRenderProps) => ReactNode;
};

export type TemplateSummary = Omit<
  TemplateDefinition,
  "parameters" | "render"
>;
