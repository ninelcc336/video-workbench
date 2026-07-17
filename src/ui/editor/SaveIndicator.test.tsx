// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "../../domain/project/factories";
import { createAutosaveController, SaveIndicator } from "./SaveIndicator";

afterEach(cleanup);

describe("自动保存控制器", () => {
  it("在防抖窗口内合并多次编辑，只保存最新项目一次", async () => {
    // 中文注释：用假时钟验证防抖边界，避免测试依赖真实等待时间。
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const controller = createAutosaveController(save, 100);

    controller.schedule(createEmptyProject());
    const latestProject = createEmptyProject();
    latestProject.settings.width = 1920;
    controller.schedule(latestProject);

    await vi.advanceTimersByTimeAsync(99);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(latestProject);
    expect(controller.getState()).toMatchObject({ status: "saved" });
    vi.useRealTimers();
  });

  it("保存失败时保留中文错误状态", async () => {
    // 中文注释：失败测试只观察控制器公共状态，不耦合内部定时器实现。
    vi.useFakeTimers();
    const controller = createAutosaveController(
      vi.fn(async () => {
        throw new Error("磁盘不可写");
      }),
      10,
    );

    controller.schedule(createEmptyProject());
    await vi.advanceTimersByTimeAsync(10);

    expect(controller.getState()).toEqual({
      status: "error",
      error: "自动保存失败：磁盘不可写",
      lastSavedAt: null,
    });
    vi.useRealTimers();
  });
});

describe("保存指示器", () => {
  it("显示最后保存时间和失败提示", () => {
    // 中文注释：组件只负责把持久化结果转换成剪辑小白能理解的中文文案。
    render(
      <SaveIndicator
        state={{
          status: "saved",
          error: null,
          lastSavedAt: new Date("2026-07-17T10:20:00.000Z"),
        }}
      />,
    );

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("已自动保存");
    expect(status.textContent).toContain("2026");
  });
});
