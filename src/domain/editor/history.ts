import type { EditProject } from "../project/model";

export type EditorHistory = {
  getSnapshot: () => EditProject;
  push: (snapshot: EditProject) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

function cloneParamValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneParamValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneParamValue(nestedValue)]),
    );
  }
  return value;
}

function cloneParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, cloneParamValue(value)]),
  );
}

function cloneProject(project: EditProject): EditProject {
  return {
    ...project,
    settings: { ...project.settings },
    videoClips: project.videoClips.map((clip) => ({ ...clip })),
    effectClips: project.effectClips.map((clip) => ({ ...clip, params: cloneParams(clip.params) })),
    export: { ...project.export },
  };
}

/** 中文注释：历史只保存完整项目快照，避免撤销时受到后续数组修改影响。 */
export function createHistory(initialProject: EditProject): EditorHistory {
  let current = cloneProject(initialProject);
  const past: EditProject[] = [];
  const future: EditProject[] = [];

  return {
    getSnapshot: () => cloneProject(current),
    push: (snapshot) => {
      past.push(current);
      current = cloneProject(snapshot);
      future.length = 0;
    },
    undo: () => {
      const previous = past.pop();
      if (!previous) {
        return;
      }
      future.push(current);
      current = previous;
    },
    redo: () => {
      const next = future.pop();
      if (!next) {
        return;
      }
      past.push(current);
      current = next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
