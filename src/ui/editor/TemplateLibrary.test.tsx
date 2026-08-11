// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerEffectFamily } from "../../domain/templates/effect-family";
import type { EffectFamilyDefinition, TemplateDefinition } from "../../domain/templates/types";
import { TEMPLATE_DRAG_MIME } from "./drag-and-drop";
import { TemplateLibrary } from "./TemplateLibrary";

const discoveryFamily: EffectFamilyDefinition = {
  id: "library-discovery-fixture",
  version: 1,
  category: "information-overlay",
  name: "步骤清单",
  description: "适合教程中的并列信息视觉样式。",
  purposeTags: ["步骤", "清单"],
  visualDirections: ["简洁信息"],
  defaultDurationInFrames: 30,
  parameters: [],
  startingStyles: [
    {
      id: "information",
      name: "信息清单",
      visualDirection: "简洁信息",
      defaultParams: {},
    },
    {
      id: "numbered",
      name: "编号步骤",
      visualDirection: "简洁信息",
      defaultParams: {},
    },
  ],
  aspectRatioDefaults: {},
  migrations: [],
  render: ({ effectFamilyId, startingStyleId }) => createElement("span", { children: `${effectFamilyId}/${startingStyleId}` }),
};

registerEffectFamily(discoveryFamily);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("特效模板库", () => {
  it("分类切换保持可访问的当前标签，并只改变模板发现结果", () => {
    render(<TemplateLibrary />);

    const informationTab = screen.getByRole("tab", { name: "信息叠加" });
    fireEvent.click(informationTab);

    expect(informationTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("template-category-information-overlay");
  });

  it("全部特效入口会清除当前分类限制", () => {
    render(<TemplateLibrary />);

    fireEvent.click(screen.getByRole("tab", { name: "信息叠加" }));
    fireEvent.click(screen.getByRole("tab", { name: "全部特效" }));

    expect(screen.getByRole("tab", { name: /^全部$/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /^信息叠加$/ }).getAttribute("aria-selected")).toBe("false");
  });

  it("从卡片添加模板时仍将当前播放头传给页面命令层", () => {
    const onAddTemplateAtFrame = vi.fn();
    render(<TemplateLibrary currentFrame={42.4} onAddTemplateAtFrame={onAddTemplateAtFrame} />);

    fireEvent.click(screen.getAllByRole("button", { name: /^添加/ })[0]);

    expect(onAddTemplateAtFrame).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String) }) as TemplateDefinition,
      42,
    );
  });

  it("按名称、用途标签和适用场景搜索特效族", () => {
    render(<TemplateLibrary />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索特效库" }), {
      target: { value: "教程" },
    });

    expect(screen.getByRole("article", { name: "步骤清单特效族" })).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "按用途筛选" }), {
      target: { value: "步骤" },
    });

    expect(screen.getByRole("article", { name: "步骤清单特效族" })).toBeTruthy();
  });

  it("族内选择起始样式后，添加的片段保留所选样式身份", () => {
    const onAddTemplateAtFrame = vi.fn();
    render(<TemplateLibrary currentFrame={42} onAddTemplateAtFrame={onAddTemplateAtFrame} />);

    fireEvent.click(screen.getByRole("radio", { name: "编号步骤" }));
    fireEvent.click(screen.getByRole("button", { name: "添加步骤清单" }));

    expect(onAddTemplateAtFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        effectFamilyId: discoveryFamily.id,
        startingStyleId: "numbered",
      }) as TemplateDefinition,
      42,
    );
  });

  it("保留片段转场分类，但不把历史全屏转场作为普通目录卡片展示", () => {
    render(<TemplateLibrary />);
    fireEvent.click(screen.getByRole("tab", { name: "片段转场" }));

    expect(screen.getByRole("tabpanel")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "基础转场特效族" })).toBeNull();
  });

  it("添加后可以从最近使用入口找到同一个特效族，且记录不进入视频工作区数据", () => {
    render(<TemplateLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "添加步骤清单" }));
    fireEvent.click(screen.getByRole("tab", { name: "最近使用" }));

    expect(screen.getByRole("article", { name: "步骤清单特效族" })).toBeTruthy();
    expect(window.localStorage.getItem("frame-flow.template-library.recent")).toContain(discoveryFamily.id);
  });

  it("从族卡片拖动时携带当前选择的起始样式", () => {
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: "",
      setData: (type: string, value: string) => values.set(type, value),
    } as unknown as DataTransfer;
    render(<TemplateLibrary />);

    fireEvent.click(screen.getByRole("radio", { name: "编号步骤" }));
    fireEvent.dragStart(screen.getByRole("article", { name: "步骤清单特效族" }), { dataTransfer });

    expect(JSON.parse(values.get(TEMPLATE_DRAG_MIME) ?? "{}")).toMatchObject({
      startingStyleId: "numbered",
    });
  });

  it("提供个人预设快捷入口而不把预设写入模板库筛选状态", () => {
    const onOpenPresets = vi.fn();
    render(<TemplateLibrary onOpenPresets={onOpenPresets} />);

    fireEvent.click(screen.getByRole("button", { name: "打开我的预设" }));

    expect(onOpenPresets).toHaveBeenCalledTimes(1);
  });
});
