import "./registry";
import {
  createEffectFamilyInstance,
  createEffectRenderInput,
  getEffectFamily,
  listEffectFamilies,
  type EffectFamilyIssue,
} from "./effect-family";
import { getDefaultParams } from "./parameter-schema";
import type {
  AspectRatio,
  EffectFamilyDefinition,
  EffectFamilyRenderProps,
  ParameterDefinition,
  StartingStyleDefinition,
} from "./types";

export const VISUAL_VERIFICATION_RANDOM_SEED = "effect-visual-verification-v1";
export const VISUAL_VERIFICATION_FONT_FAMILY = 'Arial, "Microsoft YaHei", sans-serif';
export const VISUAL_VERIFICATION_CHROMIUM_ARGS = [
  "--font-render-hinting=none",
  "--disable-lcd-text",
] as const;

export const VISUAL_VERIFICATION_VIEWPORTS: Readonly<Record<AspectRatio, { width: number; height: number }>> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

export type VisualVerificationScope =
  | { kind: "catalog" }
  | { kind: "family"; familyId: string; version?: number }
  | { kind: "style"; familyId: string; version?: number; startingStyleId: string };

export type VisualVerificationFrameStage = "enter" | "middle" | "exit";

export type VisualVerificationScenario =
  | "default"
  | "minimum"
  | "maximum"
  | "long-text"
  | "max-structured-items"
  | "advanced-overflow";

export type VisualVerificationTarget = {
  family: EffectFamilyDefinition;
  style: StartingStyleDefinition;
};

export type VisualVerificationCase = {
  id: string;
  familyId: string;
  familyVersion: number;
  familyName: string;
  startingStyleId: string;
  startingStyleName: string;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  frameStage: VisualVerificationFrameStage;
  frame: number;
  scenario: VisualVerificationScenario;
  parameterKey?: string;
  renderProps: EffectFamilyRenderProps;
  errors: EffectFamilyIssue[];
  warnings: EffectFamilyIssue[];
};

export type VisualVerificationMatrixOptions = {
  scope?: VisualVerificationScope;
  randomSeed?: string;
};

type BoundarySide = "minimum" | "maximum";
type ScenarioInput = {
  scenario: VisualVerificationScenario;
  parameterKey?: string;
  params: Record<string, unknown>;
};

const ASPECT_RATIOS: ReadonlyArray<AspectRatio> = ["16:9", "9:16", "1:1"];
const LONG_TEXT = "这是一段用于视觉回归的长文本，包含 English words 和中文内容，用来验证换行、缩放与安全布局。";

/** 中文注释：按用户选择的范围解析目标族和起始样式，目录默认包含历史族以便继续验证兼容渲染。 */
export function selectVisualVerificationTargets(
  scope: VisualVerificationScope,
): VisualVerificationTarget[] {
  if (scope.kind === "catalog") {
    return listEffectFamilies({ includeLegacy: true })
      .flatMap((summary) => {
        const family = getEffectFamily(summary.id, summary.version);
        return family.startingStyles.map((style) => ({ family, style }));
      });
  }

  let family: EffectFamilyDefinition;
  try {
    family = getEffectFamily(scope.familyId, scope.version);
  } catch {
    throw new Error(`视觉验证找不到特效族：${scope.familyId}${scope.version ? `@${scope.version}` : ""}`);
  }

  if (scope.kind === "family") {
    return family.startingStyles.map((style) => ({ family, style }));
  }

  const style = family.startingStyles.find((candidate) => candidate.id === scope.startingStyleId);
  if (!style) {
    throw new Error(`视觉验证找不到起始样式：${family.id}/${scope.startingStyleId}`);
  }
  return [{ family, style }];
}

/** 中文注释：固定帧只依赖片段时长直接求值，1:1 仅保留中段以控制矩阵规模并符合规格。 */
export function getVisualVerificationFrameSamples(
  durationInFrames: number,
  aspectRatio: AspectRatio,
): Array<{ stage: VisualVerificationFrameStage; frame: number }> {
  const duration = Number.isFinite(durationInFrames) && durationInFrames > 0
    ? Math.max(1, Math.round(durationInFrames))
    : 1;
  const middle = Math.floor((duration - 1) / 2);
  const samples: Array<{ stage: VisualVerificationFrameStage; frame: number }> = [
    { stage: "middle", frame: middle },
  ];

  if (aspectRatio === "1:1") return samples;

  return [
    { stage: "enter", frame: 0 },
    ...samples,
    { stage: "exit", frame: duration - 1 },
  ];
}

/** 中文注释：构造结构化条目的默认形状，矩阵始终传数组而不是历史分隔符字符串。 */
function createStructuredItem(parameter: Extract<ParameterDefinition, { type: "structured-list" }>): Record<string, unknown> {
  return getDefaultParams(parameter.itemSchema);
}

/** 中文注释：生成可通过 schema 校验的长文本，优先遵守声明的最大长度，避免测试把非法输入误当视觉基线。 */
function createLongText(maxLength?: number): string {
  const repeated = `${LONG_TEXT} ${LONG_TEXT}`;
  return maxLength === undefined ? repeated : Array.from(repeated).slice(0, Math.max(0, maxLength)).join("");
}

/** 中文注释：为边界场景提供参数类型对应的最小或最大合法值；没有明确边界的颜色等参数不虚构场景。 */
function getBoundaryValue(parameter: ParameterDefinition, side: BoundarySide): unknown | undefined {
  const isMinimum = side === "minimum";
  switch (parameter.type) {
    case "text":
    case "multiline-text":
      return isMinimum ? "" : createLongText(parameter.maxLength);
    case "number":
      return isMinimum ? parameter.min : parameter.max;
    case "select":
      return parameter.options[isMinimum ? 0 : parameter.options.length - 1]?.value;
    case "boolean":
      return !isMinimum;
    case "position":
      return {
        x: isMinimum ? (parameter.minX ?? 0) : (parameter.maxX ?? 1),
        y: isMinimum ? (parameter.minY ?? 0) : (parameter.maxY ?? 1),
      };
    case "size":
      return {
        width: isMinimum ? (parameter.minWidth ?? 0) : (parameter.maxWidth ?? 1),
        height: isMinimum ? (parameter.minHeight ?? 0) : (parameter.maxHeight ?? 1),
      };
    case "structured-list": {
      const itemCount = isMinimum ? parameter.minItems : parameter.maxItems;
      if (itemCount === undefined) return undefined;
      return Array.from({ length: itemCount }, () => createStructuredItem(parameter));
    }
    case "gradient": {
      const stopCount = isMinimum ? parameter.minStops : parameter.maxStops;
      if (stopCount === undefined) return undefined;
      return {
        angle: 90,
        stops: Array.from({ length: stopCount }, (_, index) => ({
          offset: stopCount <= 1 ? 0 : index / (stopCount - 1),
          color: index % 2 === 0 ? "#14b8a6" : "#38bdf8",
        })),
      };
    }
    case "spacing": {
      const value = isMinimum ? parameter.min : parameter.max;
      if (value === undefined) return undefined;
      return { top: value, right: value, bottom: value, left: value };
    }
    case "font":
    case "icon":
      return parameter.options[isMinimum ? 0 : parameter.options.length - 1]?.value;
    case "animation-stage":
      return undefined;
    case "color":
      return undefined;
  }
}

/** 中文注释：按参数声明生成单个场景，所有对象值先深拷贝以隔离不同固定帧之间的输入。 */
function createScenarioInputs(
  family: EffectFamilyDefinition,
  baseParams: Record<string, unknown>,
): ScenarioInput[] {
  const scenarios: ScenarioInput[] = [{ scenario: "default", params: structuredClone(baseParams) }];

  for (const parameter of family.parameters) {
    for (const scenario of ["minimum", "maximum"] as const) {
      const value = getBoundaryValue(parameter, scenario);
      if (value === undefined) continue;
      scenarios.push({
        scenario,
        parameterKey: parameter.key,
        params: { ...structuredClone(baseParams), [parameter.key]: structuredClone(value) },
      });
    }

    if (parameter.type === "text" || parameter.type === "multiline-text") {
      scenarios.push({
        scenario: "long-text",
        parameterKey: parameter.key,
        params: {
          ...structuredClone(baseParams),
          [parameter.key]: createLongText(parameter.maxLength),
        },
      });
    }

    if (parameter.type === "structured-list" && parameter.maxItems !== undefined) {
      scenarios.push({
        scenario: "max-structured-items",
        parameterKey: parameter.key,
        params: {
          ...structuredClone(baseParams),
          [parameter.key]: Array.from(
            { length: parameter.maxItems },
            () => createStructuredItem(parameter),
          ),
        },
      });
    }

    if (
      parameter.level === "advanced" &&
      parameter.safety === "warn-on-overflow" &&
      supportsAdvancedOverflow(parameter)
    ) {
      const value = parameter.type === "position"
        ? { x: -0.12, y: 1.12 }
        : { width: 1.12, height: 1.12 };
      scenarios.push({
        scenario: "advanced-overflow",
        parameterKey: parameter.key,
        params: { ...structuredClone(baseParams), [parameter.key]: value },
      });
    }
  }

  return scenarios;
}

/** 中文注释：只有声明范围允许越过安全区时才生成高级越界案例，避免把硬约束误报为验证器错误。 */
function supportsAdvancedOverflow(
  parameter: ParameterDefinition,
): parameter is Extract<ParameterDefinition, { type: "position" | "size" }> {
  if (parameter.type === "position") {
    return (
      (parameter.minX === undefined || parameter.minX <= -0.12) &&
      (parameter.maxX === undefined || parameter.maxX >= 1.12) &&
      (parameter.minY === undefined || parameter.minY <= -0.12) &&
      (parameter.maxY === undefined || parameter.maxY >= 1.12)
    );
  }
  if (parameter.type === "size") {
    return (
      (parameter.minWidth === undefined || parameter.minWidth <= 0) &&
      (parameter.maxWidth === undefined || parameter.maxWidth >= 1.12) &&
      (parameter.minHeight === undefined || parameter.minHeight <= 0) &&
      (parameter.maxHeight === undefined || parameter.maxHeight >= 1.12)
    );
  }
  return false;
}

/** 中文注释：把族、样式、画幅、固定帧和参数场景组合成可序列化案例，渲染前统一走深模块入口。 */
export function buildVisualVerificationMatrix(
  options: VisualVerificationMatrixOptions = {},
): VisualVerificationCase[] {
  const targets = selectVisualVerificationTargets(options.scope ?? { kind: "catalog" });
  const randomSeed = options.randomSeed ?? VISUAL_VERIFICATION_RANDOM_SEED;

  return targets.flatMap(({ family, style }) => ASPECT_RATIOS.flatMap((aspectRatio) => {
    const viewport = VISUAL_VERIFICATION_VIEWPORTS[aspectRatio];
    const instance = createEffectFamilyInstance(family, style.id, aspectRatio);
    const scenarios = createScenarioInputs(family, instance.params);

    const frameSamples = getVisualVerificationFrameSamples(instance.durationInFrames, aspectRatio);
    return scenarios.flatMap(({ scenario, parameterKey, params }) => {
      // 中文注释：默认参数建立三段式视觉基线，极端参数集中验证中段，避免全目录重复渲染同一边界场景。
      const samples = scenario === "default"
        ? frameSamples
        : frameSamples.filter((sample) => sample.stage === "middle");
      return samples.map(({ stage, frame }) => {
        const renderInput = createEffectRenderInput({
          familyId: family.id,
          version: family.version,
          startingStyleId: style.id,
          aspectRatio,
          frame,
          fps: 30,
          width: viewport.width,
          height: viewport.height,
          durationInFrames: instance.durationInFrames,
          params,
          randomSeed,
        });

        return {
          id: [
            family.id,
            `v${family.version}`,
            style.id,
            aspectRatio.replace(":", "-"),
            stage,
            scenario,
            parameterKey ?? "all",
          ].join("/"),
          familyId: family.id,
          familyVersion: family.version,
          familyName: family.name,
          startingStyleId: style.id,
          startingStyleName: style.name,
          aspectRatio,
          width: viewport.width,
          height: viewport.height,
          frameStage: stage,
          frame: renderInput.renderProps.frame,
          scenario,
          parameterKey,
          renderProps: renderInput.renderProps,
          errors: renderInput.errors,
          warnings: renderInput.warnings,
        } satisfies VisualVerificationCase;
      });
    });
  }));
}
