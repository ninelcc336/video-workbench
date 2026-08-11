// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PresetDialog } from "./PresetDialog";

afterEach(cleanup);

describe("个人预设对话框", () => {
  it("允许选择样式范围并把范围交给保存回调", () => {
    const onSave = vi.fn();

    render(
      <PresetDialog
        onApply={vi.fn()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onSave={onSave}
        open
      />,
    );

    fireEvent.change(screen.getByLabelText("预设范围"), { target: { value: "style" } });
    fireEvent.change(screen.getByLabelText("预设名称"), { target: { value: "品牌样式" } });
    fireEvent.click(screen.getByRole("button", { name: "保存预设" }));

    expect(onSave).toHaveBeenCalledWith("品牌样式", "style");
  });
});
