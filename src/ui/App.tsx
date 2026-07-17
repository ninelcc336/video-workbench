import { createEditorStore } from "../domain/editor/editor-store";
import { createEmptyProject } from "../domain/project/factories";
import { EditorPage } from "./editor/EditorPage";
import type { EditProject } from "../domain/project/model";

async function saveLocalProject(project: EditProject): Promise<void> {
  const response = await fetch("/api/workspace/projects/local-project", {
    body: JSON.stringify(project),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "本地项目保存失败");
  }
}

/** 中文注释：App 只组装本地空项目和编辑器页面，后续可在这里接入工作区打开流程。 */
export function App() {
  return <EditorPage onSaveProject={saveLocalProject} store={createEditorStore(createEmptyProject())} />;
}
