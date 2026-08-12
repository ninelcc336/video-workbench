// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EffectClip } from "../../domain/project/model";
import { registerEffectFamily } from "../../domain/templates/effect-family";
import { getEffectFamily } from "../../domain/templates/registry";
import type { EffectFamilyDefinition } from "../../domain/templates/types";
import { PropertiesPanel } from "./PropertiesPanel";

afterEach(cleanup);

function createEffectClip(): EffectClip {
  const family = getEffectFamily("card-overlay", 1);
  return {
    id: "effect-1",
    templateId: family.id,
    templateVersion: family.version,
    effectFamilyId: family.id,
    startingStyleId: "default",
    placement: { type: "range" },
    trackId: "effects-1",
    fromFrame: 0,
    durationInFrames: family.defaultDurationInFrames,
    params: {
      text: "旧文字",
      color: "#111827",
      textColor: "#ffffff",
      position: { x: 0.5, y: 0.72 },
      size: { width: 0.72, height: 0.14 },
      enterDirection: "left",
      animationDuration: 18,
      radius: 24,
    },
  };
}

const structuredPropertiesFamily: EffectFamilyDefinition = {
  id: "properties-panel-fixture",
  version: 1,
  category: "information-overlay",
  name: "属性面板测试族",
  description: "覆盖新版属性控件的测试声明。",
  purposeTags: ["steps"],
  visualDirections: ["concise-information"],
  defaultDurationInFrames: 90,
  parameters: [
    {
      key: "title",
      label: "标题",
      type: "multiline-text",
      defaultValue: "默认标题",
      group: "content",
      level: "basic",
      styleSwitch: "preserve",
    },
    {
      key: "items",
      label: "步骤条目",
      type: "structured-list",
      defaultValue: [{ label: "默认步骤" }],
      itemSchema: [{ key: "label", label: "步骤名称", type: "text", defaultValue: "" }],
      minItems: 1,
      maxItems: 3,
      group: "content",
      level: "basic",
      styleSwitch: "preserve",
    },
    {
      key: "opacity",
      label: "透明度",
      type: "number",
      defaultValue: 0.8,
      min: 0,
      max: 1,
      step: 0.01,
      group: "appearance",
      level: "basic",
      styleSwitch: "replace",
    },
    {
      key: "position",
      label: "位置",
      type: "position",
      defaultValue: { x: 0.5, y: 0.5 },
      group: "layout",
      level: "basic",
      styleSwitch: "preserve",
      safety: "warn-on-overflow",
    },
    {
      key: "gradient",
      label: "背景渐变",
      type: "gradient",
      defaultValue: {
        angle: 90,
        stops: [
          { offset: 0, color: "#111827" },
          { offset: 1, color: "#14b8a6" },
        ],
      },
      minStops: 2,
      maxStops: 3,
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "font",
      label: "字体",
      type: "font",
      defaultValue: "sans",
      options: [{ value: "sans", label: "无衬线" }, { value: "mono", label: "等宽" }],
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "backgroundColor",
      label: "背景颜色",
      type: "color",
      defaultValue: "#111827",
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "textColor",
      label: "文字颜色",
      type: "color",
      defaultValue: "#ffffff",
      group: "appearance",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "icon",
      label: "图标",
      type: "icon",
      defaultValue: "check",
      options: [{ value: "check", label: "勾选" }],
      group: "content",
      level: "advanced",
      styleSwitch: "preserve",
    },
    {
      key: "spacing",
      label: "内边距",
      type: "spacing",
      defaultValue: { top: 8, right: 12, bottom: 8, left: 12 },
      min: 0,
      max: 48,
      step: 1,
      group: "layout",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "stages",
      label: "动画阶段",
      type: "animation-stage",
      stages: ["enter", "sustain", "exit"],
      defaultValue: {
        enter: { durationInFrames: 8, delayInFrames: 0, direction: "left", easing: "ease-out", intensity: 1, stagger: 0 },
        sustain: { durationInFrames: 20, delayInFrames: 0, direction: "none", easing: "linear", intensity: 1, stagger: 0 },
        exit: { durationInFrames: 8, delayInFrames: 0, direction: "right", easing: "ease-in", intensity: 1, stagger: 0 },
      },
      group: "animation",
      level: "advanced",
      styleSwitch: "replace",
    },
    {
      key: "density",
      label: "粒子密度",
      type: "number",
      defaultValue: 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      group: "behavior",
      level: "advanced",
      styleSwitch: "replace",
    },
  ],
  startingStyles: [
    {
      id: "default",
      name: "默认",
      visualDirection: "concise-information",
      defaultParams: {},
    },
    {
      id: "compact",
      name: "紧凑",
      visualDirection: "concise-information",
      defaultParams: { opacity: 0.6 },
    },
  ],
  aspectRatioDefaults: {},
  render: () => null,
};

registerEffectFamily(structuredPropertiesFamily);

/** 中文注释：构造包含结构化内容和新版复合参数的片段夹具，所有断言都通过属性面板公共交互验证。 */
function createStructuredEffectClip(): EffectClip {
  const template = getEffectFamily("properties-panel-fixture", 1);
  return {
    id: "structured-effect-1",
    templateId: template.id,
    templateVersion: template.version,
    effectFamilyId: structuredPropertiesFamily.id,
    startingStyleId: "default",
    placement: { type: "range" },
    trackId: "effects-1",
    fromFrame: 0,
    durationInFrames: template.defaultDurationInFrames,
    params: {
      title: "这是一段需要调整的标题",
      items: [{ label: "第一步" }, { label: "第二步" }],
      opacity: 0.8,
      position: { x: 0.5, y: 0.5 },
      gradient: structuredPropertiesFamily.parameters.find((parameter) => parameter.key === "gradient")?.defaultValue,
      font: "sans",
      backgroundColor: "#ffffff",
      textColor: "#ffffff",
      icon: "check",
      spacing: { top: 8, right: 12, bottom: 8, left: 12 },
      stages: structuredPropertiesFamily.parameters.find((parameter) => parameter.key === "stages")?.defaultValue,
      density: 0.95,
    },
  };
}

describe("特效参数面板", () => {
  it("显示特效族起始样式并把切换交给页面命令", () => {
    const onSwitchStartingStyle = vi.fn();

    render(
      <PropertiesPanel
        onSwitchStartingStyle={onSwitchStartingStyle}
        project={createEmptyProject()}
        selectedClip={createStructuredEffectClip()}
      />,
    );

    fireEvent.change(screen.getByLabelText("起始样式"), { target: { value: "compact" } });

    expect(onSwitchStartingStyle).toHaveBeenCalledWith("structured-effect-1", "compact");
  });

  it("根据模板声明显示中文参数控件", () => {
    render(
      <PropertiesPanel
        project={createEmptyProject()}
        selectedClip={createEffectClip()}
      />,
    );

    expect(screen.getByRole("heading", { name: "特效参数" })).toBeTruthy();
    expect((screen.getByLabelText("文字") as HTMLInputElement).value).toBe("旧文字");
    expect((screen.getByLabelText("卡片颜色") as HTMLInputElement).value).toBe("#111827");
    expect((screen.getByLabelText("入场方向") as HTMLSelectElement).value).toBe("left");
  });

  it("修改控件时只发出参数命令，不直接修改片段对象", () => {
    const clip = createEffectClip();
    const onChangeParams = vi.fn();

    render(
      <PropertiesPanel
        project={createEmptyProject()}
        selectedClip={clip}
        onChangeParams={onChangeParams}
      />,
    );

    fireEvent.change(screen.getByLabelText("文字"), { target: { value: "新文字" } });

    expect(onChangeParams).toHaveBeenCalledWith("effect-1", { text: "新文字" });
    expect(clip.params.text).toBe("旧文字");
  });

  it("没有选中特效时显示引导文案", () => {
    render(<PropertiesPanel project={createEmptyProject()} selectedClip={null} />);

    expect(screen.getByText("选择一个特效片段开始调整")).toBeTruthy();
  });

  it("基础模式只显示高频参数，高级模式按参数分组折叠显示", () => {
    render(
      <PropertiesPanel
        project={createEmptyProject()}
        selectedClip={createStructuredEffectClip()}
      />,
    );

    expect(screen.getByRole("button", { name: "显示高级特效参数" })).toBeTruthy();
    expect(screen.getByLabelText("标题")).toBeTruthy();
    expect(screen.queryByLabelText("字体")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "显示高级特效参数" }));

    expect(screen.getByRole("button", { name: "内容" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "布局" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "外观" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "动画" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "行为" })).toBeTruthy();
    expect(screen.getByLabelText("字体")).toBeTruthy();
    expect(screen.getByLabelText("背景渐变第1个色标")).toBeTruthy();
  });

  it("支持结构化条目的字段编辑、增删排序和多行粘贴", () => {
    const onChangeParams = vi.fn();
    render(
      <PropertiesPanel
        project={createEmptyProject()}
        selectedClip={createStructuredEffectClip()}
        onChangeParams={onChangeParams}
      />,
    );

    const firstItem = screen.getByLabelText("步骤名称第1项");
    fireEvent.change(firstItem, { target: { value: "新的第一步" } });
    expect(onChangeParams).toHaveBeenLastCalledWith("structured-effect-1", {
      items: [{ label: "新的第一步" }, { label: "第二步" }],
    });

    fireEvent.click(screen.getByRole("button", { name: "添加条目" }));
    expect(onChangeParams).toHaveBeenLastCalledWith("structured-effect-1", {
      items: [{ label: "第一步" }, { label: "第二步" }, { label: "" }],
    });

    fireEvent.click(screen.getByRole("button", { name: "上移第2项" }));
    expect(onChangeParams).toHaveBeenLastCalledWith("structured-effect-1", {
      items: [{ label: "第二步" }, { label: "第一步" }],
    });

    fireEvent.paste(screen.getByLabelText("步骤名称第1项"), {
      clipboardData: { getData: () => "粘贴第一行\n粘贴第二行" },
    });
    expect(onChangeParams).toHaveBeenLastCalledWith("structured-effect-1", {
      items: [{ label: "粘贴第一行" }, { label: "粘贴第二行" }],
    });
  });

  it("显示非法参数、画面越界、低对比和高渲染负载警告", () => {
    const clip = createStructuredEffectClip();
    clip.params = {
      ...clip.params,
      title: "超长标题".repeat(30),
      position: { x: 1.2, y: -0.1 },
      density: 1,
      unknown: "旧字段",
    };

    render(
      <PropertiesPanel
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    expect(screen.getByRole("status", { name: "特效参数警告" })).toBeTruthy();
    expect(screen.getByText(/超出安全区域/)).toBeTruthy();
    expect(screen.getByText(/文本较长/)).toBeTruthy();
    expect(screen.getByText(/渲染负载较高/)).toBeTruthy();
    expect(screen.getByText(/对比度/)).toBeTruthy();
    expect(screen.getByText(/未知参数/)).toBeTruthy();
  });

  it("显示真实转场源素材尾帧不足的非阻断警告", () => {
    const clip = createEffectClip();
    clip.templateId = "basic-transition";
    clip.params = getEffectFamily("basic-transition", 1).parameters.reduce<Record<string, unknown>>((params, parameter) => {
      params[parameter.key] = parameter.defaultValue;
      return params;
    }, {});
    clip.placement = {
      type: "boundary",
      beforeVideoClipId: "before-video",
      afterVideoClipId: "after-video",
    };
    const project = createEmptyProject();
    project.videoClips = [
      {
        id: "before-video",
        mediaId: "before-media",
        fromFrame: 0,
        sourceStartFrame: 0,
        durationInFrames: 30,
        sourceDurationInFrames: 31,
        audioEnabled: true,
      },
      {
        id: "after-video",
        mediaId: "after-media",
        fromFrame: 30,
        sourceStartFrame: 0,
        durationInFrames: 30,
        sourceDurationInFrames: 60,
        audioEnabled: true,
      },
    ];

    render(<PropertiesPanel project={project} selectedClip={clip} />);

    expect(screen.getByRole("status", { name: "特效参数警告" })).toBeTruthy();
    expect(screen.getByText(/前视频素材尾帧不足/)).toBeTruthy();
  });

  it("把阻断错误关联到具体控件并标记结构化参数无效", () => {
    const clip = createStructuredEffectClip();
    clip.params = { ...clip.params, title: 123, items: "不是数组" };

    render(
      <PropertiesPanel
        project={createEmptyProject()}
        selectedClip={clip}
      />,
    );

    const title = screen.getByLabelText("标题");
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(title.getAttribute("aria-errormessage")).toBeTruthy();
    expect(screen.getByRole("group", { name: "步骤条目" }).getAttribute("aria-invalid")).toBe("true");
  });

  it("每个参数分组可以一次重置，并让范围滑杆只在手势结束时提交", () => {
    const onPreviewParams = vi.fn();
    const onChangeParams = vi.fn();
    render(
      <PropertiesPanel
        project={createEmptyProject()}
        selectedClip={createStructuredEffectClip()}
        onChangeParams={onChangeParams}
        onPreviewParams={onPreviewParams}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "显示高级特效参数" }));
    fireEvent.click(screen.getByRole("button", { name: "重置外观参数" }));
    expect(onChangeParams).toHaveBeenCalledWith("structured-effect-1", expect.objectContaining({ opacity: 0.8 }));

    const range = screen.getByLabelText("粒子密度滑杆");
    fireEvent.change(range, { target: { value: "0.7" } });
    fireEvent.change(range, { target: { value: "0.8" } });
    expect(onPreviewParams).toHaveBeenLastCalledWith("structured-effect-1", { density: 0.8 });
    expect(onChangeParams).not.toHaveBeenCalledWith("structured-effect-1", { density: 0.8 });

    fireEvent.pointerUp(range);
    expect(onChangeParams).toHaveBeenLastCalledWith("structured-effect-1", { density: 0.8 });
  });
});
// 中文注释：验证参数面板通过回调修改模板参数。
