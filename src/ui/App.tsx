import { useEffect, useState } from "react";
import { createEditorStore } from "../domain/editor/editor-store";
import { createEmptyProject } from "../domain/project/factories";
import type { EditProject } from "../domain/project/model";
import { EditorPage } from "./editor/EditorPage";

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

type ProjectResponse = {
  project: EditProject;
  missingMediaIds?: string[];
  mediaSources?: Record<string, string>;
};

/** 中文注释：App 只组装本地空项目和编辑器页面，后续可在这里接入工作区打开流程。 */
export function App() {
  const [project, setProject] = useState<EditProject | null>(null);
  const [missingMediaIds, setMissingMediaIds] = useState<string[]>([]);
  const [mediaSources, setMediaSources] = useState<Record<string, string>>({});

  useEffect(() => {
    // 中文注释：启动时尝试恢复默认项目，首次使用或服务未启动时回退到空项目。
    fetch("/api/workspace/projects/local-project")
      .then(async (response) => {
        if (response.status === 404) return createEmptyProject();
        if (!response.ok) throw new Error("无法读取本地项目");
        return response.json() as Promise<EditProject | ProjectResponse>;
      })
      .then((value) => {
        // 中文注释：兼容旧项目接口，同时优先采用带缺失状态和稳定媒体 URL 的新响应。
        if ("project" in value) {
          setMissingMediaIds(value.missingMediaIds ?? []);
          setMediaSources(value.mediaSources ?? {});
          setProject(value.project);
          return;
        }
        setProject(value);
      })
      .catch(() => setProject(createEmptyProject()));
  }, []);

  if (!project) return <main><p>正在打开本地工作区…</p></main>;
  return <EditorPage mediaSources={mediaSources} missingMediaIds={missingMediaIds} onSaveProject={saveLocalProject} store={createEditorStore(project)} />;
}
