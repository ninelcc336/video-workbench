import { createEditorStore } from "../domain/editor/editor-store";
import { createEmptyProject } from "../domain/project/factories";
import { EditorPage } from "./editor/EditorPage";

/** 中文注释：App 只组装本地空项目和编辑器页面，后续可在这里接入工作区打开流程。 */
export function App() {
  return <EditorPage store={createEditorStore(createEmptyProject())} />;
}
