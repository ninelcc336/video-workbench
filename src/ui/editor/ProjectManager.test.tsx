// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectManager } from "./ProjectManager";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 中文注释：构造工作区管理器的最小夹具，确保各用例只关注应用内管理交互。 */
function renderProjectManager(overrides: Partial<ComponentProps<typeof ProjectManager>> = {}) {
  const callbacks = { onCreate: vi.fn(), onDelete: vi.fn(), onOpen: vi.fn(), onRename: vi.fn() };
  render(<ProjectManager {...callbacks} workspaceId="本地工作区" workspaces={[{ id: "本地工作区", name: "本地工作区" }]} {...overrides} />);
  return callbacks;
}

describe("编辑页工作区管理入口", () => {
  // 中文注释：顶栏应直接显示当前工作区名称，并把工作区生命周期操作收进独立管理入口。
  it("直接展示当前工作区选择器且不提供复制工作区", () => {
    renderProjectManager();

    expect(screen.getByRole("combobox", { name: "选择视频工作区" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "工作区管理" }));

    expect(screen.getByRole("dialog", { name: "管理视频工作区" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新建" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
  });

  // 中文注释：创建和重命名均使用同一应用内表单，提交前会裁剪用户输入的空白。
  it("通过自定义表单创建工作区，不调用浏览器原生输入框", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.spyOn(window, "prompt");
    renderProjectManager({ onCreate });

    fireEvent.click(screen.getByRole("button", { name: "工作区管理" }));
    fireEvent.change(screen.getByLabelText("工作区名称"), { target: { value: "  新视频  " } });
    fireEvent.click(screen.getByRole("button", { name: "新建" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("新视频"));
    expect(prompt).not.toHaveBeenCalled();
  });

  // 中文注释：危险删除必须先经过可键盘访问的警告对话框，取消不触发删除回调。
  it("删除工作区要求确认，取消时保持当前工作区不变", () => {
    const { onDelete } = renderProjectManager();

    fireEvent.click(screen.getByRole("button", { name: "工作区管理" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("alertdialog", { name: "删除“本地工作区”？" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    expect(onDelete).toHaveBeenCalledWith("本地工作区");
  });

  // 中文注释：服务端失败需要在原表单上下文给出可观察反馈，而不是静默关闭管理窗口。
  it("重命名失败时在管理表单中展示错误", async () => {
    const onRename = vi.fn().mockRejectedValue(new Error("工作区名称已存在"));
    renderProjectManager({ onRename });

    fireEvent.click(screen.getByRole("button", { name: "工作区管理" }));
    fireEvent.change(screen.getByLabelText("工作区名称"), { target: { value: "重复名称" } });
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));

    expect((await screen.findByRole("alert")).textContent).toContain("工作区名称已存在");
  });
});
