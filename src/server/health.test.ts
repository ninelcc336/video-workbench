import { describe, expect, it } from "vitest";
import { getHealthStatus } from "./health";

describe("本地服务健康检查", () => {
  it("返回服务正常状态", () => {
    // 中文注释：健康检查只验证本地服务是否可用，不提前耦合渲染器状态。
    expect(getHealthStatus()).toEqual({ ok: true });
  });
});
