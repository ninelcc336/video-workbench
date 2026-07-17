import { defineConfig, devices } from "@playwright/test";

// 中文注释：E2E 同时启动本地 Node 服务和 Vite，验证真实浏览器入口。
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev:all",
    reuseExistingServer: true,
    timeout: 30_000,
    url: "http://127.0.0.1:5173",
  },
});
