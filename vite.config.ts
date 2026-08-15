import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 中文注释：开发前端使用 5173，API 请求转发到未被系统排除的本地 Node 端口 5174。
    proxy: { "/api": "http://localhost:5174" },
  },
});
