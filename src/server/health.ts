export function getHealthStatus(): { ok: true } {
  // 中文注释：保持健康检查为纯函数，方便服务路由和测试复用。
  return { ok: true };
}
