import { Composition } from "remotion";
import { createEmptyProject } from "../domain/project/factories";
import { EditorComposition, getCompositionDurationInFrames } from "./EditorComposition";

const emptyProject = createEmptyProject();

// 中文注释：Root 为 Remotion 注册稳定的 Editor composition，实际项目通过 inputProps 注入。
export function Root() {
  return (
    <Composition
      component={EditorComposition}
      defaultProps={{ project: emptyProject, mediaSources: {} }}
      durationInFrames={getCompositionDurationInFrames(emptyProject)}
      fps={emptyProject.settings.fps}
      height={emptyProject.settings.height}
      id="Editor"
      width={emptyProject.settings.width}
    />
  );
}
