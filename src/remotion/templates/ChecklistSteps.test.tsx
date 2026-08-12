import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createEffectFamilyInstance,
  createEffectRenderInput,
  getEffectFamily,
  listEffectFamilies,
  switchStartingStyle,
  validateEffectFamilyParams,
} from "../../domain/templates/effect-family";
import type { AnimationStageValue, EffectFamilyDefinition } from "../../domain/templates/types";
import "../../domain/templates/registry";

type RenderOverrides = Record<string, unknown>;

const FAMILY_ID = "checklist-steps";
const FAMILY_VERSION = 1;

/** 中文注释：测试通过注册表公共查询获取试点族，避免直接导入族内注册副作用。 */
function getFamily(): EffectFamilyDefinition {
  return getEffectFamily(FAMILY_ID, FAMILY_VERSION);
}

/** 中文注释：构造固定画幅的统一渲染输入，测试只观察深模块输出而不拼装内部参数清洗逻辑。 */
function createRenderProps(
  startingStyleId: string,
  aspectRatio: "16:9" | "9:16" | "1:1",
  params?: RenderOverrides,
  frame = 48,
) {
  const family = getFamily();
  const instance = createEffectFamilyInstance(family, startingStyleId, aspectRatio);
  return createEffectRenderInput({
    familyId: family.id,
    version: family.version,
    startingStyleId,
    aspectRatio,
    frame,
    fps: 30,
    width: aspectRatio === "9:16" ? 1080 : 1920,
    height: aspectRatio === "9:16" ? 1920 : 1080,
    durationInFrames: instance.durationInFrames,
    params: params ?? instance.params,
    randomSeed: "checklist-steps-test",
  });
}

/** 中文注释：通过公开渲染入口取得固定画幅静态标记，避免测试拼装内部参数清洗逻辑。 */
function renderMarkup(
  startingStyleId: string,
  overrides: RenderOverrides = {},
  frame = 48,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
): string {
  const input = createRenderProps(
    startingStyleId,
    aspectRatio,
    { ...createEffectFamilyInstance(getFamily(), startingStyleId, aspectRatio).params, ...overrides },
    frame,
  );
  return renderToStaticMarkup(getFamily().render(input.renderProps));
}

describe("清单与步骤特效族", () => {
  it("目录展示三个起始样式，并将条目声明为结构化参数", () => {
    const summary = listEffectFamilies({ text: "清单与步骤" }).find((family) => family.id === FAMILY_ID);
    const family = getFamily();
    const items = family.parameters.find((parameter) => parameter.key === "items");

    expect(summary).toMatchObject({
      id: FAMILY_ID,
      name: "清单与步骤",
      category: "information-overlay",
      purposeTags: expect.arrayContaining(["清单", "步骤"]),
      startingStyles: [
        expect.objectContaining({ id: "information-list", name: "信息清单" }),
        expect.objectContaining({ id: "numbered-steps", name: "编号步骤" }),
        expect.objectContaining({ id: "horizontal-flow", name: "横向流程" }),
      ],
    });
    expect(items).toMatchObject({
      type: "structured-list",
      minItems: 1,
      maxItems: 8,
      allowReordering: true,
    });
    expect(items && items.type === "structured-list" ? items.itemSchema.map((field) => field.key) : []).toEqual([
      "body",
      "highlight",
      "icon",
      "accentColor",
    ]);
  });

  it("根据起始样式和画幅生成不同的安全布局默认值", () => {
    const family = getFamily();
    const horizontal = createEffectFamilyInstance(family, "information-list", "16:9");
    const vertical = createEffectFamilyInstance(family, "information-list", "9:16");
    const square = createEffectFamilyInstance(family, "information-list", "1:1");
    const numbered = createEffectFamilyInstance(family, "numbered-steps", "16:9");
    const flow = createEffectFamilyInstance(family, "horizontal-flow", "16:9");

    expect(horizontal.params.position).not.toEqual(vertical.params.position);
    expect(horizontal.params.size).not.toEqual(vertical.params.size);
    expect(square.params.size).toEqual({ width: 0.82, height: 0.42 });
    expect(numbered.params.itemMarker).toBe("number");
    expect(flow.params.orientation).toBe("horizontal");
    expect((horizontal.params.items as unknown[]).length).toBeGreaterThan(0);
  });

  it("保留结构化内容和用户布局切换起始样式，并替换表现参数", () => {
    const family = getFamily();
    const source = createEffectFamilyInstance(family, "information-list", "16:9");
    const instance = {
      ...source,
      params: {
        ...source.params,
        title: "我的课程步骤",
        position: { x: 0.18, y: 0.72 },
        size: { width: 0.64, height: 0.3 },
        items: [
          {
            body: "先建立问题",
            highlight: "明确目标",
            icon: "icon.check",
            accentColor: "#f59e0b",
          },
        ],
      },
    };
    const result = switchStartingStyle(family, instance, "numbered-steps");

    expect(result.instance.params.title).toBe("我的课程步骤");
    expect(result.instance.params.items).toEqual(instance.params.items);
    expect(result.instance.params.position).toEqual(instance.params.position);
    expect(result.instance.params.size).toEqual(instance.params.size);
    expect(result.instance.params.itemMarker).toBe("number");
    expect(result.instance.params.orientation).toBe("vertical");

    const withLayout = switchStartingStyle(family, instance, "horizontal-flow", {
      useAspectRatioLayout: true,
    });
    expect(withLayout.instance.params.position).not.toEqual(instance.params.position);
    expect(withLayout.instance.params.size).not.toEqual(instance.params.size);
    expect(withLayout.instance.params.items).toEqual(instance.params.items);
  });

  it("拒绝分隔符文本并只向渲染输入提供结构化条目", () => {
    const family = getFamily();
    const instance = createEffectFamilyInstance(family, "information-list", "16:9");
    const result = validateEffectFamilyParams(family, {
      ...instance.params,
      items: "正文|重点\n另一行|结论",
    });

    expect(result.errors).toEqual([
      expect.objectContaining({ key: "items", code: "invalid_parameter" }),
    ]);
    expect(Array.isArray(result.params.items)).toBe(true);
  });

  it("以统一节点渲染独立正文、重点文字、图标和条目强调色，并保持确定性", () => {
    const family = getFamily();
    const params = createEffectFamilyInstance(family, "information-list", "9:16").params;
    const editedParams = {
      ...params,
      title: "学习路径",
      items: [
        {
          body: "先拆解问题",
          highlight: "找到关键变量",
          icon: "icon.check",
          accentColor: "#f59e0b",
        },
        {
          body: "再验证假设",
          highlight: "记录证据",
          icon: "icon.check",
          accentColor: "#38bdf8",
        },
      ],
    };
    const first = createRenderProps("information-list", "9:16", editedParams);
    const second = createRenderProps("information-list", "9:16", editedParams);
    const markup = renderToStaticMarkup(family.render(first.renderProps));

    expect(markup).toContain('data-template-id="checklist-steps"');
    expect(markup).toContain('data-starting-style-id="information-list"');
    expect(markup).toContain("先拆解问题");
    expect(markup).toContain("找到关键变量");
    expect(markup).toContain('data-asset-id="icon.check"');
    expect(markup).toContain("#f59e0b");
    expect(renderToStaticMarkup(family.render(first.renderProps))).toBe(
      renderToStaticMarkup(family.render(second.renderProps)),
    );
  });

  it("公开的排版与颜色参数会反映到响应式文字样式，并按字号重新计算布局", () => {
    const base = renderMarkup("information-list");
    const customized = renderMarkup("information-list", {
      alignment: "center",
      fontSize: 48,
      fontWeight: "800",
      highlightColor: "#22c55e",
      mutedColor: "#a855f7",
      textColor: "#f97316",
      font: "font.system-mono",
    });

    expect(customized).not.toBe(base);
    expect(customized).toContain("font-size:34.56px");
    expect(customized).toContain("font-family:var(--effect-font-system-mono)");
    expect(customized).toContain("font-weight:800");
    expect(customized).toContain("text-align:center");
    expect(customized).toContain("color:#f97316");
    expect(customized).toContain("color:#22c55e");
    expect(customized).toContain("color:#a855f7");

    const longText = "这是一段很长的中文条目内容，用于验证字号变化后仍由响应式布局重新计算安全字号";
    const longMarkup = renderMarkup("information-list", {
      fontSize: 72,
      items: [{
        body: longText,
        highlight: "重要结论",
        icon: "icon.check",
        accentColor: "#2dd4bf",
      }],
    });
    expect(longMarkup).toContain("font-size:42.76740237691001px");
    expect(longMarkup).toContain("font-size:40.4352px");
  });

  it("公开的间距、卡片外观和结构行为参数会改变可观察渲染结果", () => {
    const solid = renderMarkup("numbered-steps", {
      cardAppearance: "solid",
      cardColor: "#111827",
      cardOpacity: 0.96,
      itemGap: 6,
      radius: 12,
      spacing: { top: 26, right: 28, bottom: 26, left: 28 },
    });
    const outline = renderMarkup("horizontal-flow", {
      alignment: "right",
      borderColor: "#22c55e",
      borderWidth: 4,
      cardAppearance: "outline",
      cardColor: "#0f172a",
      cardOpacity: 0.8,
      itemGap: 20,
      position: { x: 0.42, y: 0.58 },
      radius: 30,
      size: { width: 0.7, height: 0.3 },
      spacing: { top: 10, right: 14, bottom: 18, left: 22 },
    });
    const gradient = renderMarkup("information-list", {
      cardAppearance: "glass",
      cardColor: "#123456",
      cardGradient: {
        angle: 45,
        stops: [
          { offset: 0, color: "#abcdef" },
          { offset: 1, color: "#fedcba" },
        ],
      },
      cardOpacity: 0.75,
    });

    expect(solid).toContain("background:#111827f5");
    expect(solid).toContain("border-radius:12px");
    expect(solid).toContain("gap:6px");
    expect(solid).toContain("padding:26px 28px 26px 28px");
    expect(solid).toContain("data-checklist-item-index=\"0\"");
    expect(solid).toContain(">1</span>");

    expect(outline).toContain("background:#0f172a25");
    expect(outline).toContain("border:4px solid #22c55e");
    expect(outline).toContain("border-radius:30px");
    expect(outline).toContain("grid-template-columns:repeat(3, minmax(0, 1fr))");
    expect(outline).toContain("gap:20px");
    expect(outline).toContain("height:324px;width:1344px");
    expect(outline).toContain("left:806.4px;position:absolute;top:626.4px");
    expect(outline).toContain("padding:10px 14px 18px 22px");
    expect(outline).toContain("text-align:right");
    expect(outline).toContain(">1</span>");

    expect(gradient).toContain("background:linear-gradient(45deg, #123456bf 0%, #fedcbabf 100%)");
  });

  it("动画阶段的交错、方向和强度会改变对应帧的可见性与位移", () => {
    const base = createEffectFamilyInstance(getFamily(), "information-list", "16:9").params;
    // 中文注释：实例参数通过公共接口以未知值返回，这里按族声明收窄阶段，避免测试绕过真实契约。
    const baseStages = base.stages as AnimationStageValue;
    const stages = {
      enter: {
        durationInFrames: 12,
        delayInFrames: 0,
        direction: "right",
        easing: "linear",
        intensity: 0.2,
        stagger: 6,
      },
      sustain: baseStages.sustain,
      exit: baseStages.exit,
    };
    const firstFrame = renderMarkup("information-list", { stages }, 1);
    const secondItemFrame = renderMarkup("information-list", { stages }, 7);
    const noStaggerFrame = renderMarkup("information-list", {
      stages: {
        ...stages,
        enter: { ...stages.enter, stagger: 0 },
      },
    }, 1);
    const exitFrame = renderMarkup("information-list", {
      stages: {
        ...stages,
        enter: { ...stages.enter, durationInFrames: 0, stagger: 0 },
        exit: { ...stages.exit, durationInFrames: 12, direction: "left", easing: "linear", intensity: 0.2, stagger: 0 },
      },
    }, 91);

    expect(firstFrame).toContain('data-checklist-item-index="0"');
    expect(firstFrame).toContain("opacity:0.08333333333333333");
    expect(firstFrame).toContain("transform:translate(352px, 0px)");
    expect(firstFrame).toContain("opacity:0");
    expect(secondItemFrame).toContain("opacity:0.08333333333333333");
    expect(noStaggerFrame).not.toBe(firstFrame);
    expect(noStaggerFrame).toContain("transform:translate(352px, 0px)");
    expect(exitFrame).toContain("transform:translate(-32px, 0px)");
    expect(exitFrame).toContain("opacity:0.9166666666666666");
  });

  it("最大条目数和越界布局保留可观察诊断，同时渲染仍使用安全结构", () => {
    const family = getFamily();
    const instance = createEffectFamilyInstance(family, "horizontal-flow", "1:1");
    const items = Array.from({ length: 6 }, (_, index) => ({
      body: `步骤 ${index + 1}`,
      highlight: `重点 ${index + 1}`,
      icon: "icon.check",
      accentColor: "#2dd4bf",
    }));
    const input = createEffectRenderInput({
      familyId: family.id,
      version: family.version,
      startingStyleId: "horizontal-flow",
      aspectRatio: "1:1",
      frame: 48,
      fps: 30,
      width: 1080,
      height: 1080,
      durationInFrames: instance.durationInFrames,
      params: { ...instance.params, items, position: { x: 1.2, y: 0.5 } },
    });

    expect(input.errors).toEqual([]);
    expect(input.warnings).toEqual([
      expect.objectContaining({ key: "position", code: "layout_overflow" }),
    ]);
    const markup = renderToStaticMarkup(family.render(input.renderProps));
    expect(markup.match(/data-checklist-item-index=/g)).toHaveLength(6);
  });
});
