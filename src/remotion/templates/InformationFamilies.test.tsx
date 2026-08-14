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
} from "../../domain/templates/types";
import "../../domain/templates/registry";

const FAMILY_CASES = [
  {
    id: "title-layer",
    styles: ["concise-chapter", "tech-numbered", "energetic-heading"],
    contentKey: "title",
    contentValue: "新的章节标题",
    visualKey: "accentColor",
    visualValue: "#f97316",
  },
  {
    id: "emphasis-card",
    styles: ["solid-card", "glass-card", "outline-card"],
    contentKey: "text",
    contentValue: "新的重点观点",
    visualKey: "cardAppearance",
    visualValue: "outline",
  },
  {
    id: "quote-comment",
    styles: ["quote-card", "comment-card", "chat-bubble"],
    contentKey: "body",
    contentValue: "新的评论内容",
    visualKey: "quoteMark",
    visualValue: "chat",
  },
  {
    id: "tag-status",
    styles: ["tag-capsules", "status-badges", "tag-cloud"],
    contentKey: "items",
    contentValue: [{ label: "新标签", value: "重点", icon: "icon.check", accentColor: "#f97316" }],
    visualKey: "layoutMode",
    visualValue: "stack",
  },
] as const;

type AspectRatio = "16:9" | "9:16" | "1:1";

/** 中文注释：测试通过注册表公共入口查找族，避免把模块文件路径或内部默认值变成测试依赖。 */
function getFamily(familyId: string): EffectFamilyDefinition {
  return getEffectFamily(familyId, 1);
}

/** 中文注释：图标可以是族级参数，也可以是结构化条目的字段；两种声明都属于审核过的素材槽位 seam。 */
function hasIconParameter(family: EffectFamilyDefinition): boolean {
  return family.parameters.some((parameter) => (
    parameter.type === "icon" ||
    (parameter.type === "structured-list" && parameter.itemSchema.some((field) => field.type === "icon"))
  ));
}

/** 中文注释：为固定帧契约提供三种真实视口，确保画幅默认值确实参与渲染输入。 */
function getViewport(aspectRatio: AspectRatio): { width: number; height: number } {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

/** 中文注释：创建统一渲染输入，让测试观察族级归一化和渲染 seam，而不是复制调用方清洗逻辑。 */
function createRenderInput(
  family: EffectFamilyDefinition,
  styleId: string,
  aspectRatio: AspectRatio,
  params: Record<string, unknown> | undefined = undefined,
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
    randomSeed: "information-families-test",
  });
}

/** 中文注释：调用族公开 render 函数生成静态标记，固定帧测试不依赖组件内部层级。 */
function renderMarkup(
  family: EffectFamilyDefinition,
  styleId: string,
  aspectRatio: AspectRatio,
  params?: Record<string, unknown>,
  frame = 48,
): string {
  return renderToStaticMarkup(family.render(createRenderInput(family, styleId, aspectRatio, params, frame).renderProps));
}

/** 中文注释：为条件渲染的公开参数打开必要上下文，让契约测试观察参数本身而不是被默认开关掩盖。 */
function prepareObservableParams(
  familyId: string,
  params: Record<string, unknown>,
  parameterKey?: string,
): Record<string, unknown> {
  const prepared = structuredClone(params);

  if (familyId === "title-layer") {
    prepared.showSubtitle = true;
    prepared.showIcon = true;
    // 中文注释：玻璃表面由渐变覆盖背景色，测试背景颜色时切换实色以保持参数可观察。
    prepared.surface = parameterKey === "surfaceColor" ? "solid" : "glass";
  } else if (familyId === "emphasis-card") {
    prepared.showLabel = true;
    // 中文注释：卡片颜色和透明度在玻璃渐变下会被遮住，相关契约使用实色背景观察。
    prepared.cardAppearance = parameterKey === "cardColor" || parameterKey === "cardOpacity"
      ? "solid"
      : "glass";
  } else if (familyId === "quote-comment") {
    prepared.showSource = true;
    // 中文注释：评论面板的基础颜色和透明度同样需要实色表面才能直接改变 CSS 背景。
    prepared.panelAppearance = parameterKey === "panelColor" || parameterKey === "panelOpacity"
      ? "solid"
      : "glass";
  } else if (familyId === "tag-status") {
    prepared.showTitle = true;
    prepared.showValues = true;
    prepared.surfaceAppearance = "glass";
  }

  return prepared;
}

/** 中文注释：为每种 schema 类型选择另一个合法值，确保测试不会把非法输入误判为参数已生效。 */
function getAlternateParameterValue(
  parameter: EffectFamilyDefinition["parameters"][number],
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
      const candidates = [
        parameter.min,
        parameter.max,
        currentNumber + step,
        currentNumber - step,
      ];
      return candidates.find((candidate) => (
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
      const moveCoordinate = (coordinate: number, min = 0, max = 1): number => {
        const delta = 0.13;
        if (coordinate + delta <= max) return coordinate + delta;
        return Math.max(min, coordinate - delta);
      };
      return {
        x: moveCoordinate(value.x, parameter.minX ?? 0, parameter.maxX ?? 1),
        y: moveCoordinate(value.y, parameter.minY ?? 0, parameter.maxY ?? 1),
      };
    }
    case "size": {
      if (!current || typeof current !== "object") return undefined;
      const value = current as { width: number; height: number };
      const resize = (dimension: number, min = 0, max = 1): number => {
        const delta = 0.11;
        if (dimension + delta <= max) return dimension + delta;
        return Math.max(min, dimension - delta);
      };
      return {
        width: resize(value.width, parameter.minWidth ?? 0, parameter.maxWidth ?? 1),
        height: resize(value.height, parameter.minHeight ?? 0, parameter.maxHeight ?? 1),
      };
    }
    case "structured-list": {
      if (!Array.isArray(current) || current.length === 0) return undefined;
      const items = structuredClone(current) as Array<Record<string, unknown>>;
      const textField = parameter.itemSchema.find((field) => (
        field.type === "text" || field.type === "multiline-text"
      ));
      if (!textField) return undefined;
      const currentText = items[0][textField.key];
      items[0] = {
        ...items[0],
        [textField.key]: currentText === "契约条目" ? "另一契约条目" : "契约条目",
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
      const nextDirection = stages.sustain.direction === "left"
        ? "right"
        : stages.sustain.direction === "right"
          ? "left"
          : "left";
      return {
        ...stages,
        sustain: {
          ...stages.sustain,
          direction: nextDirection,
          intensity: stages.sustain.intensity + 0.01,
        },
      };
    }
  }
}

describe("现有信息叠加特效族", () => {
  it("注册四个信息表达族和规格要求的十二个起始样式", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      expect(family.category).toBe("information-overlay");
      expect(family.startingStyles.map((style) => style.id)).toEqual([...familyCase.styles]);
      expect(family.startingStyles).toHaveLength(3);
    }

    const informationFamilies = listEffectFamilies({ category: "information-overlay" });
    expect(informationFamilies.map((family) => family.id)).toEqual(expect.arrayContaining(
      FAMILY_CASES.map((familyCase) => familyCase.id),
    ));
  });

  it("每个族都声明五组参数、素材槽位和完整参数说明", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      const groups = new Set(family.parameters.map((parameter) => parameter.group));

      expect(groups).toEqual(new Set(["content", "layout", "appearance", "animation", "behavior"]));
      expect(family.parameters.filter((parameter) => parameter.level === "basic")).toHaveLength(7);
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

    const tags = getFamily("tag-status").parameters.find((parameter) => parameter.key === "items");
    expect(tags).toMatchObject({ type: "structured-list", minItems: 1, maxItems: 8, allowReordering: true });
  });

  it("三种画幅使用独立默认布局，并在族内切换时保留内容和用户布局", () => {
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

  it("每个起始样式都能渲染非空且同族样式具有可观察差异", () => {
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

  it("每个公开参数都能改变统一渲染结果，单选素材槽位则验证实际使用", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      const styleId = familyCase.styles[0];
      const baseInstance = createEffectFamilyInstance(family, styleId, "16:9");

      for (const parameter of family.parameters) {
        const baseParams = prepareObservableParams(family.id, baseInstance.params, parameter.key);
        const nextValue = getAlternateParameterValue(parameter, baseParams[parameter.key]);
        const baseInput = createEffectRenderInput({
          familyId: family.id,
          version: family.version,
          startingStyleId: styleId,
          aspectRatio: "16:9",
          frame: 48,
          fps: 30,
          width: 1920,
          height: 1080,
          durationInFrames: baseInstance.durationInFrames,
          params: baseParams,
          randomSeed: "information-families-parameter-contract",
        });
        const baseMarkup = renderToStaticMarkup(family.render(baseInput.renderProps));

        if (nextValue === undefined) {
          expect(parameter.type, `${family.id}/${parameter.key} 应为只有一个合法选项的素材槽位`).toBe("icon");
          if (parameter.type !== "icon") continue;
          expect(parameter.options).toHaveLength(1);
          expect(baseMarkup).toContain(`data-asset-id="${parameter.options[0].value}"`);
          continue;
        }

        const changedInput = createEffectRenderInput({
          familyId: family.id,
          version: family.version,
          startingStyleId: styleId,
          aspectRatio: "16:9",
          frame: 48,
          fps: 30,
          width: 1920,
          height: 1080,
          durationInFrames: baseInstance.durationInFrames,
          params: { ...baseParams, [parameter.key]: nextValue },
          randomSeed: "information-families-parameter-contract",
        });
        expect(changedInput.errors, `${family.id}/${parameter.key} 不能使用非法契约值`).toEqual([]);
        expect(renderToStaticMarkup(family.render(changedInput.renderProps)), `${family.id}/${parameter.key}`).not.toBe(baseMarkup);
      }
    }
  });

  it("固定输入重复渲染保持确定性，并验证结构化条目的图标素材", () => {
    for (const familyCase of FAMILY_CASES) {
      const family = getFamily(familyCase.id);
      const styleId = familyCase.styles[0];
      const baseInstance = createEffectFamilyInstance(family, styleId, "16:9");
      const params = prepareObservableParams(family.id, baseInstance.params);
      const first = renderMarkup(family, styleId, "16:9", params, 24);
      expect(renderMarkup(family, styleId, "16:9", params, 24)).toBe(first);

      for (const parameter of family.parameters) {
        if (parameter.type !== "structured-list") continue;
        for (const field of parameter.itemSchema) {
          if (field.type !== "icon") continue;
          expect(renderMarkup(family, styleId, "16:9", params)).toContain(
            `data-asset-id="${field.options[0].value}"`,
          );
        }
      }
    }
  });
});
