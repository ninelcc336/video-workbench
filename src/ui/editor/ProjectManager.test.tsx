// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectManager } from "./ProjectManager";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("编辑页项目管理入口", () => {
  // 中文注释：项目管理器即使收到旧的最近工作区数据，也不能把工作区控件渲染回编辑页。
  it("只展示项目选择与项目 CRUD，不把工作区选择器放在同级控件中", () => {
    render(
      <ProjectManager
        onCopy={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        projectId="local-project"
        projects={[{ id: "local-project", name: "本地项目" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "项目" }));

    expect(screen.getByRole("combobox", { name: "选择编辑项目" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "选择最近工作区" })).toBeNull();
  });
});
