// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TemplateDefinition } from "../../domain/templates/types";
import { TemplateLibrary } from "./TemplateLibrary";

afterEach(cleanup);

describe("特效模板库", () => {
  it("分类切换保持可访问的当前标签，并只改变模板发现结果", () => {
    render(<TemplateLibrary />);

    const informationTab = screen.getByRole("tab", { name: "信息叠加" });
    fireEvent.click(informationTab);

    expect(informationTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("template-category-information-overlay");
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
});
