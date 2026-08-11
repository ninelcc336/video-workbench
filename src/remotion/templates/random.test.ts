import { describe, expect, it } from "vitest";
import { createSeededRandom, seededRandom } from "./random";

describe("特效确定性随机", () => {
  it("相同种子和索引重复求值时返回相同结果", () => {
    // 中文注释：固定帧渲染可能跳跃求值，因此随机值不能依赖可变的调用顺序。
    expect(seededRandom("project-seed", 7)).toBe(seededRandom("project-seed", 7));
    expect(createSeededRandom("project-seed")(12)).toBe(createSeededRandom("project-seed")(12));
  });

  it("不同种子或索引会产生可区分的稳定序列", () => {
    const random = createSeededRandom("project-seed");
    const sequence = [0, 1, 2, 3].map(random);

    expect(sequence.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(sequence).size).toBe(sequence.length);
    expect(sequence).not.toEqual([0, 0, 0, 0]);
    expect(seededRandom("another-seed", 0)).not.toBe(sequence[0]);
  });

  it("不读取真实时间或使用无种子随机源", () => {
    // 中文注释：重复渲染同一局部帧时，随机结果必须仍由显式种子完全决定。
    const before = seededRandom("frame-18", 18);
    const after = seededRandom("frame-18", 18);

    expect(after).toBe(before);
  });
});
