// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 中文注释：空项目库是首次启动的正常状态，不应再要求用户理解或选择本地目录。 */
describe("固定本地项目库启动", () => {
  it("项目库为空时直接显示新建编辑项目入口，且不存在目录输入", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => [],
      ok: true,
    } as Response);

    render(<App />);

    await expect(screen.findByRole("region", { name: "空项目库" })).resolves.toBeTruthy();
    expect(screen.getByLabelText("新建编辑项目名称")).toBeTruthy();
    expect(screen.queryByLabelText("启动工作区路径")).toBeNull();
    expect(screen.queryByText("最近使用")).toBeNull();
  });

  it("新建项目会先裁剪名称，再刷新固定项目库列表", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce({ json: async () => [], ok: true } as Response)
      .mockResolvedValueOnce({ json: async () => ({ ok: true }), ok: true } as Response)
      .mockResolvedValueOnce({ json: async () => [], ok: true } as Response);

    render(<App />);

    const input = await screen.findByLabelText("新建编辑项目名称");
    fireEvent.change(input, { target: { value: "  知识视频  " } });
    fireEvent.click(screen.getByRole("button", { name: "新建编辑项目" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/workspace/projects/%E7%9F%A5%E8%AF%86%E8%A7%86%E9%A2%91",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("首次读取损坏项目且存在备份时提供恢复入口", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ json: async () => [{ id: "损坏项目", name: "损坏项目" }], ok: true } as Response)
      .mockResolvedValueOnce({ json: async () => ({ backupAvailable: true, message: "编辑项目已损坏" }), ok: false } as Response);

    render(<App />);

    expect((await screen.findByRole("alert")).textContent).toContain("编辑项目已损坏");
    expect(screen.getByRole("button", { name: "从最近备份恢复" })).toBeTruthy();
  });
});
