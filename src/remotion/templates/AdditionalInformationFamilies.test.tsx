import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createEffectFamilyInstance,
  createEffectRenderInput,
  getEffectFamily,
  listEffectFamilies,
  switchStartingStyle,
} from "../../domain/templates/effect-family";
import type {
  AnimationStageValue,
  EffectFamilyDefinition,
  GradientValue,
  ParameterDefinition,
} from "../../domain/templates/types";
import "../../domain/templates/registry";

const FAMILY_CASES = [
  {
    id: "lower-third",
    styles: ["person-identity", "term-definition", "source-attribution"],
    contentKey: "title",
    contentValue: "新的信息标题",
    visualKey: "surface",
    visualValue: "outline",
  },
  {
    id: "data-number",
    styles: ["key-metric", "progress-indicator"],
    contentKey: "value",
    contentValue: 93,
    visualKey: "displayMode",
    visualValue: "progress",
  },
  {
    id: "comparison-conclusion",
    styles: ["side-by-side", "verdict-chapter"],
    contentKey: "items",
    contentValue: [
      { left: "新的左侧", right: "新的右侧", accentColor: "#f97316", icon: "icon.check" },
    ],
    visualKey: "layoutMode",
    visualValue: "verdict",
  },
] as const;

type AspectRatio = "16:9" | "9:16" | "1:1";

/** 中文注释：测试通过注册表公共入口查找新增族，避免把渲染模块路径变成调用方契约。 */
function getFamily(familyId: string): EffectFamilyDefinition {
  return getEffectFamily(familyId, 1);
}

/** 中文注释：图标既可能是族级素材槽位，也可能出现在结构化条目字段中。 */
function hasIconParameter(family: EffectFamilyDefinition): boolean {
  return family.parameters.some((parameter) => (
    parameter.type === "icon" ||
    (parameter.type === "structured-list" && parameter.itemSchema.some((field) => field.type === "icon"))
  ));
}

/** 中文注释：固定视口使画幅默认值和公开渲染输入都能在测试中被观察。 */
function getViewport(aspectRatio: AspectRatio): { width: number; height: number } {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

/** 中文注释：所有新增族都通过统一深模块入口生成渲染输入，测试不复制参数归一化逻辑。 */
function createRenderInput(
  family: EffectFamilyDefinition,
  styleId: string,
  aspectRatio: AspectRatio,
  params?: Record<string, unknown>,
  frame = 48,
) {
  const instance = createEffectFamilyInstance(family, styleId, aspectRatio);
  const viewport = getViewport(aspectRatio);
  return createEffectRenderInput({
    familyId: family.id,
    version: family.version,
    startingStyleId: styleId,
    aspectRatio,
    frame,
    fps: 30,
    width: viewport.width,
    height: viewport.height,
    durationInFrames: instance.durationInFrames,
    params: params ?? instance.params,
    randomSeed: "additional-information-families-test",
  });
}

/** 中文注释：通过族的公开 render seam 生成静态标记，避免测试绑定组件内部 DOM 层级。 */
function renderMarkup(
  family: EffectFamilyDefinition,
  styleId: string,
  aspectRatio: AspectRatio,
  params?: Record<string, unknown>,
  frame = 48,
): string {
  return renderToStaticMarkup(family.render(createRenderInput(family, styleId, aspectRatio, params, frame).renderProps));
}

/** 中文注释：打开条件内容和渐变表面，让每个公开参数都有机会改变真实渲染结果。 */
function prepareObservableParams(
  familyId: string,
  params: Record<string, unknown>,
  parameterKey?: string,
): Record<string, unknown> {
  const prepared = structuredClone(params);

  if (familyId === "lower-third") {
    prepared.showSubtitle = true;
    prepared.showIcon = true;
    prepared.showSource = true;
    prepared.surface = parameterKey === "surfaceColor" || parameterKey === "surfaceOpacity" ? "solid" : "glass";
  } else if (familyId === "data-number") {
    prepared.showTrend = true;
    prepared.showProgress = true;
    prepared.showIcon = true;
    prepared.displayMode = parameterKey === "progressColor" || parameterKey === "progressTrackColor" ? "progress" : prepared.displayMode;
    prepared.surface = parameterKey === "surfaceColor" || parameterKey === "surfaceOpacity" ? "solid" : "glass";
  } else if (familyId === "comparison-conclusion") {
    prepared.showItems = true;
    prepared.showConclusion = true;
    // 中文注释：结论正文和强调色只有在结论布局中可见，契约测试将其放到对应语义上下文观察。
    prepared.layoutMode = parameterKey === "layoutMode" ? prepared.layoutMode : "verdict";
    prepared.surface = parameterKey === "surfaceColor" || parameterKey === "surfaceOpacity" ? "solid" : "glass";
  }

  return prepared;
}

/** 中文注释：为每种 schema 类型选择另一个合法值，确保契约测试验证真实行为而不是非法回退。 */
function getAlternateParameterValue(
  parameter: ParameterDefinition,
  current: unknown,
): unknown | undefined {
  switch (parameter.type) {
    case "text":
    case "multiline-text": {
      const value = current === "契约值" ? "另一契约值" : "契约值";
      return value.length <= (parameter.maxLength ?? Number.POSITIVE_INFINITY) ? value : undefined;
    }
    case "color":
      return current === "#f97316" ? "#0f766e" : "#f97316";
    case "number": {
      const currentNumber = typeof current === "number" ? current : parameter.defaultValue;
      const step = parameter.step ?? 1;
      return [parameter.min, parameter.max, currentNumber + step, currentNumber - step]
        .find((candidate) => (
          candidate !== undefined &&
          Number.isFinite(candidate) &&
          candidate !== currentNumber &&
          (parameter.min === undefined || candidate >= parameter.min) &&
          (parameter.max === undefined || candidate <= parameter.max)
        ));
    }
    case "select":
      return parameter.options.find((option) => option.value !== current)?.value;
    case "boolean":
      return typeof current === "boolean" ? !current : undefined;
    case "position": {
      if (!current || typeof current !== "object") return undefined;
      const value = current as { x: number; y: number };
      const move = (coordinate: number, min = 0, max = 1): number => (
        coordinate + 0.13 <= max ? coordinate + 0.13 : Math.max(min, coordinate - 0.13)
      );
      return {
        x: move(value.x, parameter.minX ?? 0, parameter.maxX ?? 1),
        y: move(value.y, parameter.minY ?? 0, parameter.maxY ?? 1),
      };
    }
    case "size": {
      if (!current || typeof current !== "object") return undefined;
      const value = current as { width: number; height: number };
      const resize = (dimension: number, min = 0, max = 1): number => (
        dimension + 0.11 <= max ? dimension + 0.11 : Math.max(min, dimension - 0.11)
      );
      return {
        width: resize(value.width, parameter.minWidth ?? 0, parameter.maxWidth ?? 1),
        height: resize(value.height, parameter.minHeight ?? 0, parameter.maxHeight ?? 1),
      };
    }
    case "structured-list": {
      if (!Array.isArray(current) || current.length === 0) return undefined;
      const items = structuredClone(current) as Array<Record<string, unknown>>;
      const textField = parameter.itemSchema.find((field) => field.type === "text" || field.type === "multiline-text");
      if (!textField) return undefined;
      items[0] = {
        ...items[0],
        [textField.key]: items[0][textField.key] === "契约条目" ? "另一契约条目" : "契约条目",
      };
      return items;
    }
    case "gradient": {
      const value = current as GradientValue;
      return {
        angle: value.angle === 90 ? 135 : 90,
        stops: value.stops.map((stop, index) => (
          index === 0
            ? { ...stop, color: stop.color === "#14b8a6" ? "#f97316" : "#14b8a6" }
            : { ...stop }
        )),
      };
    }
    case "spacing": {
      const value = current as { top: number; right: number; bottom: number; left: number };
      const step = parameter.step ?? 1;
      const next = value.top + step <= (parameter.max ?? Number.POSITIVE_INFINITY)
        ? value.top + step
        : value.top - step;
      return next >= (parameter.min ?? 0) && next !== value.top
        ? { top: next, right: next, bottom: next, left: next }
        : undefined;
    }
    case "font":
    case "icon":
      return parameter.options.find((option) => option.value !== current)?.value;
    case "animation-stage": {
      const stages = structuredClone(current) as AnimationStageValue;
      if (!stages.sustain) return undefined;
      return {
        ...stages,
        sustain: {
          ...stages.sustain,
          direction: stages.sustain.direction === "left" ? "right" : "left",
          intensity: stages.sustain.intensity + 0.01,
        },
      };
    }
  }
}

describe("新增信息叠加特效族", () => {
  it("注册三个族和票据要求的七个起始样式", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      expect(family.category).toBe("information-overlay");
      expect(family.startingStyles.map((style) => style.id)).toEqual([...familyCase.styles]);
    }

    const informationFamilies = listEffectFamilies({ category: "information-overlay" });
    expect(informationFamilies.map((family) => family.id)).toEqual(expect.arrayContaining(
      FAMILY_CASES.map((familyCase) => familyCase.id),
    ));
  });

  it("按各族语义声明五组参数、素材槽位、画幅默认值和三段式动画", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      expect(new Set(family.parameters.map((parameter) => parameter.group))).toEqual(
        new Set(["content", "layout", "appearance", "animation", "behavior"]),
      );
      expect(family.parameters.filter((parameter) => parameter.level === "basic").length).toBeGreaterThanOrEqual(5);
      expect(family.parameters.filter((parameter) => parameter.level === "basic").length).toBeLessThanOrEqual(8);
      expect(family.parameters.some((parameter) => parameter.type === "font")).toBe(true);
      expect(hasIconParameter(family)).toBe(true);
      expect(family.parameters.some((parameter) => parameter.type === "animation-stage")).toBe(true);
      expect(family.parameters.some((parameter) => parameter.type === "position")).toBe(true);
      expect(family.parameters.some((parameter) => parameter.type === "size")).toBe(true);
      expect(family.parameters.every((parameter) => parameter.description?.trim())).toBe(true);
      expect(family.startingStyles.every((style) => (
        style.aspectRatioDefaults?.["16:9"] &&
        style.aspectRatioDefaults?.["9:16"] &&
        style.aspectRatioDefaults?.["1:1"]
      ))).toBe(true);
    }

    expect(getFamily("comparison-conclusion").parameters.some((parameter) => parameter.type === "structured-list")).toBe(true);
    expect(getFamily("comparison-conclusion").parameters.find((parameter) => parameter.key === "items"))
      .toMatchObject({ type: "structured-list", minItems: 1, maxItems: 4, allowReordering: true });
  });

  it("三种画幅使用独立默认布局，样式切换保留内容、位置、尺寸和时间范围", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      const firstStyle = familyCase.styles[0];
      const secondStyle = familyCase.styles[1];
      const wide = createEffectFamilyInstance(family, firstStyle, "16:9");
      const portrait = createEffectFamilyInstance(family, firstStyle, "9:16");
      const square = createEffectFamilyInstance(family, firstStyle, "1:1");
      expect(wide.params.position).not.toEqual(portrait.params.position);
      expect(portrait.params.size).not.toEqual(square.params.size);

      const edited = {
        ...wide,
        params: {
          ...wide.params,
          [familyCase.contentKey]: familyCase.contentValue,
          position: { x: 0.2, y: 0.78 },
          size: { width: 0.62, height: 0.28 },
        },
      };
      const switched = switchStartingStyle(family, edited, secondStyle);
      expect(switched.instance.params[familyCase.contentKey]).toEqual(familyCase.contentValue);
      expect(switched.instance.params.position).toEqual({ x: 0.2, y: 0.78 });
      expect(switched.instance.params.size).toEqual({ width: 0.62, height: 0.28 });
      expect(switched.instance.startingStyleId).toBe(secondStyle);
      expect(switched.instance.durationInFrames).toBe(edited.durationInFrames);
    }
  });

  it("每个起始样式都产生可观察差异，且持续阶段不是静止模板换色", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      const rendered = familyCase.styles.map((styleId) => renderMarkup(family, styleId, "9:16"));
      rendered.forEach((markup, index) => {
        expect(markup).toContain(`data-effect-family="${family.id}"`);
        expect(markup).toContain(`data-starting-style-id="${familyCase.styles[index]}"`);
        expect(markup).toContain("data-effect-primitive");
      });
      expect(new Set(rendered).size).toBe(familyCase.styles.length);

      const sustainSignatures = family.startingStyles.map((style) => {
        const stages = style.defaultParams.stages as AnimationStageValue;
        return `${stages.sustain?.direction}/${stages.sustain?.easing}/${stages.sustain?.intensity}`;
      });
      expect(sustainSignatures.every((signature) => !signature.startsWith("none/"))).toBe(true);
      expect(new Set(sustainSignatures).size).toBe(familyCase.styles.length);
    }
  });

  it("每个公开参数都能改变统一渲染结果，且固定输入重复渲染稳定", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      const styleId = familyCase.styles[0];
      const baseInstance = createEffectFamilyInstance(family, styleId, "16:9");

      for (const parameter of family.parameters) {
        const baseParams = prepareObservableParams(family.id, baseInstance.params, parameter.key);
        const nextValue = getAlternateParameterValue(parameter, baseParams[parameter.key]);
        const baseInput = createRenderInput(family, styleId, "16:9", baseParams).renderProps;
        const baseMarkup = renderToStaticMarkup(family.render(baseInput));

        if (nextValue === undefined) {
          expect(parameter.type, `${family.id}/${parameter.key} 应为只有一个合法选项的素材槽位`).toBe("icon");
          if (parameter.type !== "icon") continue;
          expect(parameter.options).toHaveLength(1);
          expect(baseMarkup).toContain(`data-asset-id="${parameter.options[0].value}"`);
          continue;
        }

        const changedInput = createRenderInput(family, styleId, "16:9", {
          ...baseParams,
          [parameter.key]: nextValue,
        }).renderProps;
        expect(renderToStaticMarkup(family.render(changedInput)), `${family.id}/${parameter.key}`).not.toBe(baseMarkup);
      }

      const params = prepareObservableParams(family.id, baseInstance.params);
      const first = renderMarkup(family, styleId, "16:9", params, 24);
      expect(renderMarkup(family, styleId, "16:9", params, 24)).toBe(first);
    }
  });
});
