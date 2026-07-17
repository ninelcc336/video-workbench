import { Composition } from "remotion";
import { createEmptyProject } from "../domain/project/factories";
import { EditorComposition, getCompositionDurationInFrames } from "./EditorComposition";

const emptyProject = createEmptyProject();

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
