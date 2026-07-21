// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectManager } from "./ProjectManager";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("编辑页项目管理入口", () => {
  // 中文注释：顶栏应直接显示当前项目名称，并把项目生命周期操作收进独立管理入口。
  it("直接展示当前项目选择器且不提供复制项目", () => {
    render(
      <ProjectManager
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        projectId="本地项目"
        projects={[{ id: "本地项目", name: "本地项目" }]}
      />,
    );

    expect(screen.getByRole("combobox", { name: "选择编辑项目" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "项目管理" }));

    expect(screen.getByRole("button", { name: "新建" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
  });
});
