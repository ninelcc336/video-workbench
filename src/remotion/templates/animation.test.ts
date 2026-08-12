import { describe, expect, it } from "vitest";
import {
  evaluateAnimationStages,
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

  it("按任意帧求解三段式动画的延迟、交错、缓动、方向和强度", () => {
    const stages = {
      enter: {
        durationInFrames: 4,
        delayInFrames: 2,
        direction: "left",
        easing: "ease-out",
        intensity: 0.5,
        stagger: 2,
      },
      sustain: {
        durationInFrames: 10,
        delayInFrames: 1,
        direction: "none",
        easing: "linear",
        intensity: 1,
        stagger: 2,
      },
      exit: {
        durationInFrames: 4,
        delayInFrames: 0,
        direction: "right",
        easing: "ease-in",
        intensity: 0.5,
        stagger: 2,
      },
    } as const;

    const beforeEnter = evaluateAnimationStages({
      frame: 3,
      durationInFrames: 24,
      stages,
      itemIndex: 1,
    });
    const duringEnter = evaluateAnimationStages({
      frame: 6,
      durationInFrames: 24,
      stages,
      itemIndex: 1,
    });
    const duringSustain = evaluateAnimationStages({
      frame: 12,
      durationInFrames: 24,
      stages,
      itemIndex: 1,
    });
    const duringExit = evaluateAnimationStages({
      frame: 21,
      durationInFrames: 24,
      stages,
      itemIndex: 1,
    });

    expect(beforeEnter.enter.startFrame).toBe(4);
    expect(beforeEnter.visibility).toBe(0);
    expect(beforeEnter.offset).toEqual({ x: -0.5, y: 0 });
    expect(duringEnter.enter.progress).toBeCloseTo(0.875, 3);
    expect(duringEnter.offset.x).toBeCloseTo(-0.0625, 3);
    expect(duringSustain.sustain.progress).toBeCloseTo(0.3, 3);
    expect(duringSustain.visibility).toBe(1);
    expect(duringExit.exit.startFrame).toBe(19);
    expect(duringExit.exit.progress).toBeCloseTo(0.125, 3);
    expect(duringExit.offset.x).toBeCloseTo(0.0625, 3);
    expect(duringExit.visibility).toBeCloseTo(0.875, 3);
  });

  it("把持续、延迟、时长、缓动和独立出场阶段暴露为可观察契约", () => {
    // 中文注释：使用未压缩的长片段比较同一帧，避免阶段压缩掩盖单个参数的真实影响。
    const baseStages = {
      enter: {
        durationInFrames: 8,
        delayInFrames: 0,
        direction: "none",
        easing: "linear",
        intensity: 0,
        stagger: 0,
      },
      sustain: {
        durationInFrames: 20,
        delayInFrames: 0,
        direction: "none",
        easing: "linear",
        intensity: 1,
        stagger: 0,
      },
      exit: {
        durationInFrames: 8,
        delayInFrames: 0,
        direction: "none",
        easing: "linear",
        intensity: 1,
        stagger: 0,
      },
    } as const;

    const duringSustain = evaluateAnimationStages({
      frame: 12,
      durationInFrames: 60,
      stages: baseStages,
    });
    expect(duringSustain.activeStage).toBe("sustain");
    expect(duringSustain.visibility).toBe(1);

    const delayed = evaluateAnimationStages({
      frame: 3,
      durationInFrames: 60,
      stages: {
        ...baseStages,
        enter: { ...baseStages.enter, delayInFrames: 4 },
      },
    });
    const withoutDelay = evaluateAnimationStages({
      frame: 3,
      durationInFrames: 60,
      stages: baseStages,
    });
    expect(delayed.enter.startFrame).toBe(4);
    expect(delayed.enter.active).toBe(false);
    expect(delayed.visibility).toBe(0);
    expect(withoutDelay.visibility).toBeGreaterThan(0);

    const shortEnter = evaluateAnimationStages({
      frame: 2,
      durationInFrames: 60,
      stages: {
        ...baseStages,
        enter: { ...baseStages.enter, durationInFrames: 4 },
      },
    });
    const longEnter = evaluateAnimationStages({
      frame: 2,
      durationInFrames: 60,
      stages: {
        ...baseStages,
        enter: { ...baseStages.enter, durationInFrames: 8 },
      },
    });
    expect(shortEnter.enter.progress).toBe(0.5);
    expect(longEnter.enter.progress).toBe(0.25);

    const linearEnter = evaluateAnimationStages({
      frame: 2,
      durationInFrames: 60,
      stages: baseStages,
    });
    const easedEnter = evaluateAnimationStages({
      frame: 2,
      durationInFrames: 60,
      stages: {
        ...baseStages,
        enter: { ...baseStages.enter, easing: "ease-out" },
      },
    });
    expect(linearEnter.enter.progress).toBe(0.25);
    expect(easedEnter.enter.progress).toBeCloseTo(0.578125, 6);

    const withExit = evaluateAnimationStages({
      frame: 30,
      durationInFrames: 60,
      stages: baseStages,
    });
    const withoutExit = evaluateAnimationStages({
      frame: 30,
      durationInFrames: 60,
      stages: {
        enter: baseStages.enter,
        sustain: baseStages.sustain,
      },
    });
    expect(withExit.activeStage).toBe("exit");
    expect(withExit.visibility).toBe(0.75);
    expect(withoutExit.exit.declared).toBe(false);
    expect(withoutExit.visibility).toBe(1);
  });

  it("阶段总时长超过片段时按固定比例压缩并返回警告", () => {
    const evaluation = evaluateAnimationStages({
      frame: 3,
      durationInFrames: 4,
      stages: {
        enter: {
          durationInFrames: 10,
          delayInFrames: 2,
          direction: "left",
          easing: "linear",
          intensity: 1,
          stagger: 0,
        },
        sustain: {
          durationInFrames: 10,
          delayInFrames: 1,
          direction: "none",
          easing: "linear",
          intensity: 1,
          stagger: 0,
        },
        exit: {
          durationInFrames: 10,
          delayInFrames: 0,
          direction: "right",
          easing: "linear",
          intensity: 1,
          stagger: 0,
        },
      },
    });

    expect(evaluation.warnings).toEqual([
      "动画阶段总时长超过 4 帧，已按固定比例压缩",
    ]);
    expect(evaluation.exit.endFrame).toBeLessThanOrEqual(4);
    expect(evaluation.enter.active).toBe(false);
  });
});
