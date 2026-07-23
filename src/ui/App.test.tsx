// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../domain/project/factories";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 中文注释：空工作区库是首次启动的正常状态，不应再要求用户理解或选择本地目录。 */
describe("视频工作区启动", () => {
  it("工作区库为空时直接显示新建视频工作区入口，且不存在目录输入", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => [],
      ok: true,
    } as Response);

    render(<App />);

    await expect(screen.findByRole("region", { name: "空工作区库" })).resolves.toBeTruthy();
    expect(screen.getByLabelText("新建视频工作区名称")).toBeTruthy();
    expect(screen.queryByLabelText("启动工作区路径")).toBeNull();
    expect(screen.queryByText("最近使用")).toBeNull();
  });

  it("新建工作区会先裁剪名称，再刷新工作区列表", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce({ json: async () => [], ok: true } as Response)
      .mockResolvedValueOnce({ json: async () => ({ ok: true }), ok: true } as Response)
      .mockResolvedValueOnce({ json: async () => [], ok: true } as Response);

    render(<App />);

    const input = await screen.findByLabelText("新建视频工作区名称");
    fireEvent.change(input, { target: { value: "  知识视频  " } });
    fireEvent.click(screen.getByRole("button", { name: "新建视频工作区" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/workspaces/%E7%9F%A5%E8%AF%86%E8%A7%86%E9%A2%91",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("首次读取失败时提供重试入口", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ json: async () => [{ id: "损坏工作区", name: "损坏工作区" }], ok: true } as Response)
      .mockResolvedValueOnce({ json: async () => ({ message: "视频工作区已损坏" }), ok: false } as Response);

    render(<App />);

    expect((await screen.findByRole("alert")).textContent).toContain("视频工作区已损坏");
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });

  it("重命名失败只显示操作错误，不能误提供当前工作区的备份恢复", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/workspaces") return { json: async () => [{ id: "验收视频 A", name: "验收视频 A" }], ok: true } as Response;
      if (url === "/api/workspaces/%E9%AA%8C%E6%94%B6%E8%A7%86%E9%A2%91%20A" && init?.method === "PATCH") {
        return { json: async () => ({ message: "工作区名称已存在" }), ok: false } as Response;
      }
      if (url === "/api/workspaces/%E9%AA%8C%E6%94%B6%E8%A7%86%E9%A2%91%20A/media") return { json: async () => [], ok: true } as Response;
      return { json: async () => ({ backupAvailable: true, mediaSources: {}, missingMediaIds: [], workspace: createEmptyProject() }), ok: true } as Response;
    });

    render(<App />);
    await screen.findByRole("combobox", { name: "选择视频工作区" });
    fireEvent.click(screen.getByRole("button", { name: "工作区管理" }));
    fireEvent.change(screen.getByLabelText("工作区名称"), { target: { value: "重复名称" } });
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));

    expect((await screen.findByRole("alert")).textContent).toContain("工作区名称已存在");
    expect(screen.queryByRole("button", { name: "从最近备份恢复" })).toBeNull();
  });
});
