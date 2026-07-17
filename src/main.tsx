import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";

// 中文注释：入口只负责挂载 React，业务状态由 App 和领域模块管理。
const root = document.getElementById("root");

if (!root) {
  throw new Error("找不到应用挂载节点");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
