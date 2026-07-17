import { registerRoot } from "remotion";
import { Root } from "./Root";

// 中文注释：Remotion bundler 需要一个明确注册 Root 的入口，导出和预览仍共享同一个 Root。
registerRoot(Root);
