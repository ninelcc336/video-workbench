// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectManager } from "./ProjectManager";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("编辑页工作区管理入口", () => {
  // 中文注释：顶栏应直接显示当前工作区名称，并把工作区生命周期操作收进独立管理入口。
  it("直接展示当前工作区选择器且不提供复制工作区", () => {
    render(
      <ProjectManager
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        workspaceId="本地工作区"
        workspaces={[{ id: "本地工作区", name: "本地工作区" }]}
      />,
    );

    expect(screen.getByRole("combobox", { name: "选择视频工作区" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "工作区管理" }));

    expect(screen.getByRole("button", { name: "新建" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
  });
});
