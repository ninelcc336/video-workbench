import { describe, expect, it } from "vitest";
import {
  getEntranceProgress,
  getExitProgress,
  getVisibilityProgress,
} from "./animation";

describe("特效片段入场和出场进度", () => {
  it("在片段开头进入、片段中段保持完整、片段尾部退出", () => {
    // 中文注释：用代表性帧验证同一时长同时覆盖入场和出场，不会只在结束帧突兀消失。
    expect(getVisibilityProgress(0, 60, 18)).toBe(0);
    expect(getVisibilityProgress(20, 60, 18)).toBe(1);
    expect(getVisibilityProgress(45, 60, 18)).toBeLessThan(1);
    expect(getVisibilityProgress(59, 60, 18)).toBeCloseTo(0, 3);
  });

  it("支持逐项入场的起始帧", () => {
    // 中文注释：清单和标签的逐项入场需要独立起始帧，但仍使用相同的确定性进度函数。
    expect(getEntranceProgress(3, 6, 3)).toBe(0);
    expect(getEntranceProgress(6, 6, 3)).toBe(0.875);
    expect(getEntranceProgress(9, 6, 3)).toBe(1);
  });

  it("短于动画时长的片段会自动收敛到片段边界", () => {
    // 中文注释：短片段不能产生负出场起点，且所有结果都必须保持在可渲染的 0 到 1 范围内。
    const progress = getExitProgress(4, 5, 18);

    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(1);
  });
});
