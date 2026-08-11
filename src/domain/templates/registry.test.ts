import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createEffectRenderInput,
  getEffectFamily,
  listEffectFamilies,
  registerEffectFamily,
} from "./effect-family";
import {
  getTemplate,
  getTemplateDefaultParams,
  listTemplates,
  normalizeParams,
  registerTemplate,
} from "./registry";
import type { EffectFamilyDefinition, TemplateDefinition } from "./types";

describe("特效模板注册表", () => {
  it("注册启动时可用的基础模板和科技解说信息叠加模板", () => {
    // 中文注释：用户通过分类浏览模板，因此基础模板和目标视频拆出的信息层都必须能被发现。
    expect(listTemplates()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "card-overlay", category: "information-overlay" }),
        expect.objectContaining({ id: "bubble-decoration", category: "decorative-animation" }),
        expect.objectContaining({ id: "basic-transition", category: "transition" }),
        expect.objectContaining({ id: "section-title-overlay", category: "information-overlay" }),
        expect.objectContaining({ id: "checklist-overlay", category: "information-overlay" }),
        expect.objectContaining({ id: "comment-panel-overlay", category: "information-overlay" }),
        expect.objectContaining({ id: "tag-pills-overlay", category: "information-overlay" }),
      ]),
    );
  });

  it("支持按分类过滤模板摘要", () => {
    // 中文注释：列表接口只返回摘要，避免模板实现细节泄漏到模板库 UI。
    const templates = listTemplates("decorative-animation");

    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ id: "bubble-decoration" });
  });

  it("按模板 ID 和版本查找模板", () => {
    const template = getTemplate("card-overlay", 1);

    expect(template).toMatchObject({ id: "card-overlay", version: 1 });
  });

  it("拒绝重复的模板 ID 和版本", () => {
    const duplicate = getTemplate("card-overlay", 1);

    expect(() => registerTemplate(duplicate)).toThrow(/重复/);
  });

  it("归一化参数时只保留声明字段并使用默认值兜底", () => {
    const template = getTemplate("card-overlay", 1);
    const params = normalizeParams(template, {
      text: "重点",
      color: "不是颜色",
      unexpected: "不会进入渲染输入",
    });

    expect(params).toMatchObject({
      text: "重点",
      color: "#111827",
    });
    expect(params).not.toHaveProperty("unexpected");
  });

  it("模板 render 接口返回可渲染的 React 节点", () => {
    const renderProps = {
      frame: 10,
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 60,
    };

    const templates: TemplateDefinition[] = listTemplates().map((summary) =>
      getTemplate(summary.id, summary.version),
    );

    for (const template of templates) {
      const element = template.render({
        ...renderProps,
        params: normalizeParams(template, {}),
      });

      expect(element).toBeTruthy();
    }
  });

  it("旧模板通过统一特效族入口按版本生成相同的渲染结果", () => {
    const template = getTemplate("card-overlay", 1);
    const family = getEffectFamily("card-overlay", 1);
    const input = createEffectRenderInput({
      familyId: family.id,
      version: family.version,
      startingStyleId: "legacy-default",
      aspectRatio: "16:9",
      frame: 24,
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: template.defaultDurationInFrames,
      params: getTemplateDefaultParams(template),
    });

    expect(family.legacy).toBe(true);
    expect(listEffectFamilies()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "card-overlay" })]),
    );
    expect(renderToStaticMarkup(family.render(input.renderProps))).toContain(
      `data-template-id="${template.id}"`,
    );
  });

  it("旧模板族摘要提供用途标签和视觉方向元数据", () => {
    // 中文注释：旧版仍需保留历史渲染，但目录搜索不能因为兼容适配而丢失策划信息。
    expect(getEffectFamily("section-title-overlay", 1)).toMatchObject({
      purposeTags: expect.arrayContaining(["标题"]),
      visualDirections: expect.arrayContaining(["简洁信息"]),
    });
    expect(getEffectFamily("basic-transition", 1)).toMatchObject({
      description: expect.stringContaining("历史全屏过渡遮罩"),
      purposeTags: expect.arrayContaining(["画面连接"]),
    });
  });

  it("旧 registry 兼容门面能发现并创建新版特效族片段", () => {
    const family: EffectFamilyDefinition = {
      id: "registry-family-fixture",
      version: 1,
      category: "decorative-animation",
      name: "注册表族测试",
      description: "验证旧调用方可以通过兼容门面使用新版族。",
      purposeTags: ["highlight"],
      visualDirections: ["tech-data"],
      defaultDurationInFrames: 24,
      parameters: [],
      startingStyles: [{
        id: "default",
        name: "默认",
        visualDirection: "tech-data",
        defaultParams: {},
      }],
      aspectRatioDefaults: {},
      migrations: [],
      render: () => null,
    };
    registerEffectFamily(family);

    const template = getTemplate(family.id, family.version);

    expect(listTemplates("decorative-animation")).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: family.id, version: family.version })]),
    );
    expect(template).toMatchObject({
      effectFamilyId: family.id,
      startingStyleId: "default",
      defaultDurationInFrames: family.defaultDurationInFrames,
    });
    expect(getTemplateDefaultParams(template)).toEqual({});
  });
});
