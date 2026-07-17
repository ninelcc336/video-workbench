import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 中文注释：开发时把浏览器 API 请求转发给本地 Node 服务。
    proxy: { "/api": "http://localhost:4173" },
  },
});
