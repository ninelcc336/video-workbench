// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import type { EffectClip } from "../../domain/project/model";
import { getTemplate } from "../../domain/templates/registry";
import { PropertiesPanel } from "./PropertiesPanel";

afterEach(cleanup);

function createEffectClip(): EffectClip {
  const template = getTemplate("card-overlay", 1);
  return {
    id: "effect-1",
    templateId: template.id,
    templateVersion: template.version,
    trackId: "effects-1",
    fromFrame: 0,
    durationInFrames: template.defaultDurationInFrames,
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

describe("特效参数面板", () => {
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
});
// 中文注释：验证参数面板通过回调修改模板参数。
