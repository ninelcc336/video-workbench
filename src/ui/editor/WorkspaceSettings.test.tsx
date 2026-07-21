// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSettings } from "./WorkspaceSettings";

describe("工作区设置入口", () => {
  // 中文注释：设置入口负责发出工作区选择意图，实际确认和打开请求由 App 处理。
  it("展示当前工作区只读状态，并能选择最近工作区", () => {
    const onOpenWorkspace = vi.fn();
    render(
      <WorkspaceSettings
        currentWorkspaceName="当前工作区"
        onOpenWorkspace={onOpenWorkspace}
        recentWorkspaces={[{ lastOpenedAt: "2026-07-21T00:00:00.000Z", name: "素材工作区", rootPath: "D:/素材工作区" }]}
      />,
    );

    expect(screen.getByLabelText("当前工作区").textContent).toContain("当前工作区");
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("combobox", { name: "选择最近工作区" }));
    fireEvent.click(screen.getByText("素材工作区"));

    expect(onOpenWorkspace).toHaveBeenCalledWith("D:/素材工作区");
  });
});
