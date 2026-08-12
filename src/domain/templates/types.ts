import type { ReactNode } from "react";

/** 中文注释：参数声明是模板与编辑器控件之间唯一需要稳定共享的契约。 */
export type ParameterBase = {
  key: string;
  label: string;
  description?: string;
  group?: ParameterGroup;
  level?: ParameterLevel;
  styleSwitch?: StyleSwitchPolicy;
  safety?: ParameterSafety;
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

export type MultilineTextParameterDefinition = ParameterBase & {
  type: "multiline-text";
  defaultValue: string;
  maxLength?: number;
};

export type StructuredListParameterDefinition = ParameterBase & {
  type: "structured-list";
  defaultValue: ReadonlyArray<Record<string, unknown>>;
  itemSchema: ReadonlyArray<ParameterDefinition>;
  minItems?: number;
  maxItems?: number;
  allowReordering?: boolean;
};

export type GradientStop = {
  offset: number;
  color: string;
};

export type GradientValue = {
  angle: number;
  stops: ReadonlyArray<GradientStop>;
};

export type GradientParameterDefinition = ParameterBase & {
  type: "gradient";
  defaultValue: GradientValue;
  minStops?: number;
  maxStops?: number;
};

export type SpacingValue = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type SpacingParameterDefinition = ParameterBase & {
  type: "spacing";
  defaultValue: SpacingValue;
  min?: number;
  max?: number;
  step?: number;
};

export type AssetParameterOption = {
  value: string;
  label: string;
};

export type FontParameterDefinition = ParameterBase & {
  type: "font";
  defaultValue: string;
  options: ReadonlyArray<AssetParameterOption>;
};

export type IconParameterDefinition = ParameterBase & {
  type: "icon";
  defaultValue: string;
  options: ReadonlyArray<AssetParameterOption>;
};

export type AnimationStageName = "enter" | "sustain" | "exit";

export type AnimationPhaseValue = {
  durationInFrames: number;
  delayInFrames: number;
  direction: string;
  easing: string;
  intensity: number;
  stagger: number;
};

export type AnimationStageValue = Partial<Record<AnimationStageName, AnimationPhaseValue>>;

export type AnimationStageParameterDefinition = ParameterBase & {
  type: "animation-stage";
  defaultValue: AnimationStageValue;
  stages: ReadonlyArray<AnimationStageName>;
};

export type ParameterDefinition =
  | TextParameterDefinition
  | ColorParameterDefinition
  | NumberParameterDefinition
  | SelectParameterDefinition
  | BooleanParameterDefinition
  | PositionParameterDefinition
  | SizeParameterDefinition
  | MultilineTextParameterDefinition
  | StructuredListParameterDefinition
  | GradientParameterDefinition
  | SpacingParameterDefinition
  | FontParameterDefinition
  | IconParameterDefinition
  | AnimationStageParameterDefinition;

/** 中文注释：新版特效族要求每个公开参数明确归属、编辑层级和样式切换行为。 */
export type EffectParameterDefinition = ParameterDefinition & {
  group: ParameterGroup;
  level: ParameterLevel;
  styleSwitch: StyleSwitchPolicy;
};

export type TemplateCategory =
  | "information-overlay"
  | "decorative-animation"
  | "transition";

export type EffectType = TemplateCategory;

export type TemplateRenderProps = {
  frame: number;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  params: Record<string, unknown>;
};

/** 中文注释：统一特效族只接受这三种首阶段画幅，未知比例由调用方映射到最近的默认布局。 */
export type AspectRatio = "16:9" | "9:16" | "1:1";

export type EffectPurposeTag = string;

export type VisualDirection = string;

/** 中文注释：参数分组是编辑器、校验器和样式切换共同使用的稳定语义边界。 */
export type ParameterGroup = "content" | "layout" | "appearance" | "animation" | "behavior";

export type ParameterLevel = "basic" | "advanced";

/** 中文注释：样式切换策略只决定参数是否接受目标样式默认值，不改变参数的渲染能力。 */
export type StyleSwitchPolicy = "preserve" | "replace";

/** 中文注释：高级布局可以把安全区域约束降级为警告，但不会跳过有限数值校验。 */
export type ParameterSafety = "protected" | "warn-on-overflow";

export type StyleSwitchBehavior = StyleSwitchPolicy;

/** 中文注释：起始样式只保存默认参数和画幅布局覆盖，不复制特效族的渲染实现。 */
export type StartingStyleDefinition = {
  id: string;
  name: string;
  description?: string;
  visualDirection: VisualDirection;
  defaultParams: Readonly<Record<string, unknown>>;
  aspectRatioDefaults?: Partial<Record<AspectRatio, Readonly<Record<string, unknown>>>>;
  parameterConstraints?: Readonly<Record<string, { maxItems?: number; maxLength?: number }>>;
};

export type EffectFamilyRenderProps = TemplateRenderProps & {
  effectFamilyId: string;
  effectFamilyVersion: number;
  startingStyleId: string;
  aspectRatio: AspectRatio;
  randomSeed: string;
};

export type TransitionVideoFrame = {
  clipId: string;
  sourceFrame: number;
  frozen: boolean;
  node: ReactNode;
};

/** 中文注释：真实片段转场额外接收两个已定位的视频帧；族只负责混合视觉，不负责读取媒体或处理音频。 */
export type EffectFamilyTransitionRenderProps = EffectFamilyRenderProps & {
  localFrame: number;
  progress: number;
  canvas: { width: number; height: number };
  before: TransitionVideoFrame;
  after: TransitionVideoFrame;
};

export type EffectFamilyMigrationOutput = {
  params: Record<string, unknown>;
  droppedKeys?: ReadonlyArray<string>;
  defaultedKeys?: ReadonlyArray<string>;
  warnings?: ReadonlyArray<string>;
};

export type EffectFamilyMigration = {
  fromVersion: number;
  toVersion: number;
  migrate: (
    params: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown> | EffectFamilyMigrationOutput;
};

/** 中文注释：特效族声明是编辑器、模板库和 Remotion 渲染器共享的唯一新版入口。 */
export type EffectFamilyDefinition = {
  id: string;
  version: number;
  category: TemplateCategory;
  name: string;
  description: string;
  purposeTags: ReadonlyArray<EffectPurposeTag>;
  visualDirections: ReadonlyArray<VisualDirection>;
  defaultDurationInFrames: number;
  parameters: ReadonlyArray<EffectParameterDefinition>;
  startingStyles: ReadonlyArray<StartingStyleDefinition>;
  aspectRatioDefaults: Partial<Record<AspectRatio, Readonly<Record<string, unknown>>>>;
  migrations: ReadonlyArray<EffectFamilyMigration>;
  render: (props: EffectFamilyRenderProps) => ReactNode;
  /** 中文注释：只有真实片段转场实现该接口；普通信息叠加和装饰动画不应读取相邻视频画面。 */
  renderTransition?: (props: EffectFamilyTransitionRenderProps) => ReactNode;
  legacy?: boolean;
};

/** 中文注释：目录只需要样式身份和策划信息，不把样式默认参数暴露给搜索和卡片调用方。 */
export type StartingStyleSummary = Omit<
  StartingStyleDefinition,
  "defaultParams" | "aspectRatioDefaults" | "parameterConstraints"
>;

export type EffectFamilySummary = Omit<
  EffectFamilyDefinition,
  "parameters" | "render" | "renderTransition" | "migrations" | "startingStyles"
> & {
  startingStyles: ReadonlyArray<StartingStyleSummary>;
};

export type TemplateDefinition = {
  id: string;
  version: number;
  category: TemplateCategory;
  name: string;
  description: string;
  defaultDurationInFrames: number;
  parameters: ReadonlyArray<ParameterDefinition>;
  /** 中文注释：兼容模板外壳可携带新版特效族身份，旧模板没有这些字段。 */
  effectFamilyId?: string;
  startingStyleId?: string;
  defaultParams?: Readonly<Record<string, unknown>>;
  render: (props: TemplateRenderProps) => ReactNode;
};

export type TemplateSummary = Omit<
  TemplateDefinition,
  "parameters" | "render" | "defaultParams"
>;
